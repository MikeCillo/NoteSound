
// load elements
const wrapper = document.querySelector(".at-wrap");
const main = wrapper.querySelector(".at-main");
const urlParams = new URLSearchParams(window.location.search);
const urlFileName = urlParams.get("filename");

if (!"WebSocket" in window) {
  alert(
    "WebSocket is NOT supported by your Browser so you cannot use external devices!"
  );
}
var timeWebSocket = new WebSocket("ws://music.local:8001/beat");
var notesWebSocket = new WebSocket("ws://music.local:8002/note");


timeWebSocket.onclose = function () {
  alert("BEAT CONNECTION WENT WRONG");
};
notesWebSocket.onclose = function () {
  alert("NOTES CONNECTION WENT WRONG");
};

// initialize alphatab
const settings = {
  file: urlFileName ?? "/file.xml",
  player: {
    enablePlayer: true,
    enableCursor: true,
    enableUserInteraction: true,
    soundFont: "/dist/soundfont/sonivox.sf2",
    scrollElement: wrapper.querySelector(".at-viewport"),
  },
};
let api = new alphaTab.AlphaTabApi(main, settings);
let timeSignaturePauses = [];
let metronomeWorker = null;
api.masterVolume = 1;

const inputElement = document.getElementById("input-file");
if (urlFileName) {
  document.getElementById("custom-input-file").style.display = "none";
}
inputElement.addEventListener("change", onUploadedFile, false);
function onUploadedFile() {
  const file = this.files[0];
  let reader = new FileReader();
  reader.onload = function (e) {
    let arrayBuffer = new Uint8Array(reader.result);
    api.load(arrayBuffer);
  };
  reader.readAsArrayBuffer(file);
}

// overlay logic
const overlay = wrapper.querySelector(".at-overlay");
api.renderStarted.on(() => {
  overlay.style.display = "flex";
});
api.renderFinished.on(() => {
  overlay.style.display = "none";
});

// track selector
function createTrackItem(track) {
  const trackItem = document
    .querySelector("#at-track-template")
    .content.cloneNode(true).firstElementChild;
  trackItem.querySelector(".at-track-name").innerText = track.name;
  trackItem.track = track;
  trackItem.onclick = (e) => {
    e.stopPropagation();
    api.renderTracks([track]);
  };
  return trackItem;
}



let lastBPM = null;

function sendBPM(bpm) {
  if (bpm !== lastBPM) {
    if (timeWebSocket.readyState === WebSocket.OPEN) {
      // Invia il BPM insieme al beat corrente
      timeWebSocket.send(JSON.stringify({ bpm: bpm }));
      lastBPM = bpm;
      console.log(`BPM aggiornato inviato a timeWebSocket: ${bpm}`);
    } else {
      console.log("⚠️ WebSocket non aperto. Impossibile inviare il BPM.");
      timeWebSocket.onopen = function () {
        timeWebSocket.send(JSON.stringify({ bpm: bpm }));
        lastBPM = bpm;
        console.log(`BPM aggiornato inviato a timeWebSocket dopo apertura: ${bpm}`);
      };
    }
  }
}



function createMetronome(score) {
  let tempoAutomation = 0;
  score.masterBars.forEach((bar) => {
    if (bar.tempoAutomation != null && tempoAutomation != bar.tempoAutomation.value) {
      tempoAutomation = bar.tempoAutomation.value; 
      sendBPM(tempoAutomation); // Invia il BPM ogni volta che cambia
    }

    let barDuration = parseFloat(60 / parseInt(tempoAutomation)) * parseInt(bar.timeSignatureNumerator);
    if (parseInt(bar.timeSignatureNumerator) == 0) return;
    let beatsWaitTime = barDuration / parseInt(bar.timeSignatureNumerator);
    
    for (let index = 1; index <= parseInt(bar.timeSignatureNumerator); index++) {
      if (index == 1) {
        timeSignaturePauses.push({
          waitTime: beatsWaitTime,
          isFirstBeat: true,
        });
      } else {
        timeSignaturePauses.push({
          waitTime: beatsWaitTime,
          isFirstBeat: false,
        });
      }
    }
  });
}






const trackList = wrapper.querySelector(".at-track-list");
api.scoreLoaded.on((score) => {
  // clear items
  trackList.innerHTML = "";
  // generate a track item for all tracks of the score
  score.tracks.forEach((track) => {
    trackList.appendChild(createTrackItem(track));
  });
  createMetronome(score);
});
api.renderStarted.on(() => {
  // collect tracks being rendered
  const tracks = new Map();
  api.tracks.forEach((t) => {
    tracks.set(t.index, t);
  });
  // mark the item as active or not
  const trackItems = trackList.querySelectorAll(".at-track");
  trackItems.forEach((trackItem) => {
    if (tracks.has(trackItem.track.index)) {
      trackItem.classList.add("active");
    } else {
      trackItem.classList.remove("active");
    }
  });
});

/** Controls **/
api.scoreLoaded.on((score) => {
  wrapper.querySelector(".at-song-title").innerText = score.title;
  wrapper.querySelector(".at-song-artist").innerText = score.artist;
});

wrapper.querySelector(".at-controls .at-print").onclick = () => {
  api.print();
};

const zoom = wrapper.querySelector(".at-controls .at-zoom select");
zoom.onchange = () => {
  const zoomLevel = parseInt(zoom.value) / 100;
  api.settings.display.scale = zoomLevel;
  api.updateSettings();
  api.render();
};

const layout = wrapper.querySelector(".at-controls .at-layout select");
layout.onchange = () => {
  switch (layout.value) {
    case "horizontal":
      api.settings.display.layoutMode = alphaTab.LayoutMode.Horizontal;
      break;
    case "page":
      api.settings.display.layoutMode = alphaTab.LayoutMode.Page;
      break;
  }
  api.updateSettings();
  api.render();
};

// player loading indicator
const playerIndicator = wrapper.querySelector(
  ".at-controls .at-player-progress"
);
api.soundFontLoad.on((e) => {
  const percentage = Math.floor((e.loaded / e.total) * 100);
  playerIndicator.innerText = percentage + "%";
});
api.playerReady.on(() => {
  playerIndicator.style.display = "none";
});

// main player controls
function getCurrentBarIndex(currentTick) {
  return api.score.masterBars
    .map((el) => el.start <= currentTick)
    .lastIndexOf(true);
}
const beatSignaler = document.getElementById("beat-signaler");
const beatLogger = document.getElementById("beat-logger");
const noteLogger = document.getElementById("note-logger");
function highlightBeat(color) {
  beatSignaler.style.color = color;
  beatSignaler.style.display = "block";
  setTimeout(function () {
    beatSignaler.style.display = "none";
  }, 100);
}
const playPause = wrapper.querySelector(".at-controls .at-player-play-pause");
const stop = wrapper.querySelector(".at-controls .at-player-stop");
playPause.onclick = (e) => {
  if (e.target.classList.contains("disabled")) {
    return;
  }
  if (e.target.classList.contains("fa-play")) {
    let currentBarIndex = getCurrentBarIndex(api.tickPosition);
    api.tickPosition = api.score.masterBars[currentBarIndex].start;
    metronomeWorker = new Worker("/js/metronomeWorker.js");
    beatLogger.innerHTML = "";
    metronomeWorker.postMessage({
      startIndex: currentBarIndex,
      pauses: timeSignaturePauses,
    });
    metronomeWorker.onmessage = function (message) {
      if (timeWebSocket.readyState != 1 || api.playerState !== alphaTab.synth.PlayerState.Playing) return;
      if (message.data.isFirstBeat) {
        beatLogger.innerHTML = '<p style="color: green;">BEAT</p>';
        //Send beat to the WebSocket
        timeWebSocket.send(
          JSON.stringify({ isFirstBeat: message.data.isFirstBeat })
        );
        highlightBeat("green");
      } else {
        beatLogger.innerHTML += '<p style="color: red;">BEAT</p>';
        //Send beat to the WebSocket
        timeWebSocket.send(
          JSON.stringify({ isFirstBeat: message.data.isFirstBeat })
        );
        highlightBeat("red");
      }
      beatLogger.scrollTo(0, beatLogger.scrollHeight);
    };
    api.playPause();
  } else if (e.target.classList.contains("fa-pause")) {
    api.playPause();
    noteLogger.innerHTML = "";
    beatLogger.innerHTML = "";
    metronomeWorker.terminate();
  }
};
stop.onclick = (e) => {
  if (e.target.classList.contains("disabled")) {
    return;
  }
  metronomeWorker.terminate();
  noteLogger.innerHTML = "";
  beatLogger.innerHTML = "";
  api.stop();
};

api.playerReady.on(() => {
  playPause.classList.remove("disabled");
  stop.classList.remove("disabled");
});
api.playerStateChanged.on((e) => {
  const icon = playPause.querySelector("i.fas");
  if (e.state === alphaTab.synth.PlayerState.Playing) {
    icon.classList.remove("fa-play");
    icon.classList.add("fa-pause");
  } else {
    icon.classList.remove("fa-pause");
    icon.classList.add("fa-play");
  }
});

// song position
function formatDuration(milliseconds) {
  let seconds = milliseconds / 1000;
  const minutes = (seconds / 60) | 0;
  seconds = (seconds - minutes * 60) | 0;
  return (
    String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0")
  );
}

const songPosition = wrapper.querySelector(".at-song-position");
let previousTime = -1;
api.playerPositionChanged.on((e) => {
  // reduce number of UI updates to second changes.
  const currentSeconds = (e.currentTime / 1000) | 0;
  if (currentSeconds == previousTime) {
    return;
  }

  songPosition.innerText =
    formatDuration(e.currentTime) + " / " + formatDuration(e.endTime);
});

api.activeBeatsChanged.on((args) => {
  noteLogger.innerHTML = "";
  for (let index = 0; index < args.activeBeats.length; index++) {
    const duration = args.activeBeats[index].duration;
    const noteValues = Array.from( args.activeBeats[index].noteValueLookup.keys() );

    let i = 0;
    for (i = 0; i < noteValues.length; i++) {
      noteLogger.innerHTML +=
        '<p style="text-align: center;">Note ' +
        noteValues[i] +
        " (" +
        duration +
        ")</p>";
    }
    noteLogger.scrollTo(0, noteLogger.scrollHeight);
  }

  const notesToSend = args.activeBeats.map(beat => ({
    duration: beat.duration,
    notes: Array.from(beat.noteValueLookup.keys())
  }));
  notesWebSocket.send(JSON.stringify({ notes: notesToSend }));
});


const countIn = wrapper.querySelector('.at-controls .at-count-in');
countIn.onclick = () => {
  countIn.classList.toggle('active');
  if (countIn.classList.contains('active')) {
    api.countInVolume = 1;
  } else {
    api.countInVolume = 0;
  }
};


/*const metronome = wrapper.querySelector('.at-controls .at-metronome');
metronome.onclick = () => {
  metronome.classList.toggle('active');
  if (metronome.classList.contains('active')) {
    api.metronomeVolume = 1;
  } else {
    api.metronomeVolume = 0;
  }
};
*/

const metronome = wrapper.querySelector('.at-controls .at-metronome');
metronome.onclick = () => {
  metronome.classList.toggle('active');
  
  // Attivare o disattivare il metronomo
  if (metronome.classList.contains('active')) {
    api.metronomeVolume = 1;
    startMetronome();  // Avviare il metronomo
  } else {
    api.metronomeVolume = 0;
    stopMetronome();   // Fermare il metronomo
  }
};





function createTrackItem(track) {
  const trackItem = document
    .querySelector("#at-track-template")
    .content.cloneNode(true).firstElementChild;

  // Inserisce il nome della traccia
  trackItem.querySelector(".at-track-name").innerText = track.name;

  // Scelta dinamica dell'icona FA in base al nome
  const iconEl = trackItem.querySelector(".at-track-icon");
  if (iconEl) {
    const iconClass = getIconClassForTrack(track.name);
    iconEl.className = `at-track-icon fa ${iconClass}`;
  }

  // Associa il dato track all'elemento
  trackItem.track = track;

  // Clic per renderizzare solo quella traccia
  trackItem.onclick = (e) => {
    e.stopPropagation();
    api.renderTracks([track]);
  };

  return trackItem;
}

// Mappa dei nomi → classi FA
function getIconClassForTrack(name) {
  const lower = name.toLowerCase();

  if (lower.includes("piano")) return "fa-music";
  if (lower.includes("guitar")) return "fa-guitar";
  if (lower.includes("drum")) return "fa-drum";
  if (lower.includes("drum")) return "fa-drum";
  if (lower.includes("violin")) return "fa-violin";
  if (lower.includes("bass")) return "fa-bass-guitar";
  if (lower.includes("vocal") || lower.includes("voice")) return "fa-microphone";
  if (lower.includes("flute")) return "fa-flute";
  if (lower.includes("sax")) return "fa-saxophone";
  if (lower.includes("trumpet")) return "fa-trumpet";
  // fallback default
  return "fa-music";
}

const trackList2 = wrapper.querySelector(".at-track-list");
api.scoreLoaded.on((score) => {
  // clear items
  trackList.innerHTML = "";
  // generate a track item for all tracks of the score
  score.tracks.forEach((track) => {
    trackList.appendChild(createTrackItem(track));
  });
});
api.renderStarted.on(() => {
  // collect tracks being rendered
  const tracks = new Map();
  api.tracks.forEach((t) => {
    tracks.set(t.index, t);
  });
  // mark the item as active or not
  const trackItems = trackList.querySelectorAll(".at-track");
  trackItems.forEach((trackItem) => {
    if (tracks.has(trackItem.track.index)) {
      trackItem.classList.add("active");
    } else {
      trackItem.classList.remove("active");
    }
  });
});