'use strict';

(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var stage = document.getElementById('stage');
  var intro = document.getElementById('intro');
  var beginBtn = document.getElementById('beginBtn');
  var statusText = document.getElementById('statusText');
  var speakBtn = document.getElementById('speakBtn');
  var stopBtn = document.getElementById('stopBtn');
  var replayBtn = document.getElementById('replayBtn');
  var speechNote = document.getElementById('speechNote');
  var speechStatus = document.getElementById('speechStatus');
  var wave = document.getElementById('wave');

  if (!stage || !beginBtn) return;

  var lineEls = Array.prototype.slice.call(document.querySelectorAll('.line'));
  var originalLines = lineEls.map(function (el) {
    return el.textContent.trim();
  });

  var hasSpeech =
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance === 'function';

  var run = 0;
  var started = false;
  var speakToken = 0;
  var pendingUtterances = 0;
  var speaking = false;

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  /* ---------------------------------------------------------------------
     Waveform bars
     --------------------------------------------------------------------- */

  if (wave) {
    var peaks = [
      0.32, 0.6, 0.45, 0.85, 0.55, 1, 0.7, 0.4, 0.9, 0.5, 0.75, 0.35, 0.65, 0.95,
      0.5, 0.8, 0.4, 0.7, 1, 0.55, 0.85, 0.45, 0.6, 0.35, 0.9, 0.5, 0.7, 0.4
    ];
    var bars = document.createDocumentFragment();

    peaks.forEach(function (peak, index) {
      var bar = document.createElement('span');
      bar.style.setProperty('--i', String(index));
      bar.style.setProperty('--peak', String(peak));
      bars.appendChild(bar);
    });

    wave.appendChild(bars);
  }

  /* ---------------------------------------------------------------------
     Message reveal
     --------------------------------------------------------------------- */

  function clearLines() {
    lineEls.forEach(function (el) {
      el.classList.remove('is-revealed', 'is-typing');
      el.textContent = '';
    });
  }

  function buildLine(el, text) {
    el.textContent = '';

    var fragment = document.createDocumentFragment();
    var chars = [];
    var words = text.split(' ');

    words.forEach(function (word, wordIndex) {
      var wordEl = document.createElement('span');
      wordEl.className = 'word';

      Array.from(word).forEach(function (ch) {
        var charEl = document.createElement('span');
        charEl.className = 'char';
        charEl.textContent = ch;
        wordEl.appendChild(charEl);
        chars.push(charEl);
      });

      fragment.appendChild(wordEl);
      if (wordIndex < words.length - 1) {
        fragment.appendChild(document.createTextNode(' '));
      }
    });

    el.appendChild(fragment);
    return chars;
  }

  async function reveal(id) {
    var reduced = reduceMotion.matches;

    for (var i = 0; i < lineEls.length; i += 1) {
      if (id !== run) return;

      var el = lineEls[i];
      var chars = buildLine(el, originalLines[i]);
      el.classList.add('is-revealed');

      if (!reduced) {
        el.classList.add('is-typing');

        for (var c = 0; c < chars.length; c += 1) {
          if (id !== run) return;
          chars[c].classList.add('is-on');

          var previous = c > 0 ? chars[c - 1].textContent : '';
          await sleep(/[.,;:\u2014]/.test(previous) ? 90 : 26);
        }

        el.classList.remove('is-typing');
        await sleep(i === lineEls.length - 1 ? 0 : 380);
      }
    }

    if (id === run) {
      statusText.textContent = 'Transmission complete';
      document.body.classList.add('is-complete');
    }
  }

  function begin() {
    if (started) return;
    started = true;
    beginBtn.disabled = true;

    intro.classList.add('is-leaving');

    sleep(reduceMotion.matches ? 0 : 260).then(function () {
      intro.hidden = true;
      document.body.classList.add('is-live');
      statusText.textContent = 'Transmission active';

      clearLines();
      stage.classList.add('is-visible');

      if (typeof stage.focus === 'function') {
        stage.focus({ preventScroll: true });
      }

      if (typeof stage.scrollIntoView === 'function') {
        stage.scrollIntoView({
          behavior: reduceMotion.matches ? 'auto' : 'smooth',
          block: 'start'
        });
      }

      run += 1;
      reveal(run);
    });
  }

  function replay() {
    stopSpeech(false);

    run += 1;
    var id = run;

    clearLines();
    document.body.classList.remove('is-complete');
    statusText.textContent = 'Transmission active';

    if (typeof stage.focus === 'function') {
      stage.focus({ preventScroll: true });
    }

    sleep(reduceMotion.matches ? 0 : 140).then(function () {
      if (id !== run) return;
      reveal(id);
    });
  }

  /* ---------------------------------------------------------------------
     Speech synthesis (opt-in only)
     --------------------------------------------------------------------- */

  // Voice lists differ wildly by platform and include joke voices, so rank
  // them instead of taking whichever English voice happens to come first.
  var naturalNames = /samantha|serena|karen|moira|tessa|kate|alex|daniel|oliver|aria|jenny|sonia|libby|hazel|ryan|guy|george/i;
  var noveltyNames = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|grandma|grandpa|junior|ralph|fred|kathy|eddy|flo|reed|rocko|sandy|shelley)\b/i;
  var nameBias = {
    samantha: 16,
    serena: 14,
    karen: 12,
    kate: 8,
    moira: 10,
    daniel: 6,
    tessa: 6
  };

  function scoreVoice(voice) {
    var name = voice.name || '';
    var lang = (voice.lang || '').toLowerCase().replace('_', '-');

    if (lang.indexOf('en') !== 0) return -1;

    var score = 0;
    if (lang.indexOf('en-gb') === 0) score += 24;
    else if (lang.indexOf('en-au') === 0) score += 22;
    else if (lang.indexOf('en-ie') === 0) score += 20;
    else if (lang.indexOf('en-us') === 0) score += 19;
    else score += 10;

    if (/natural|neural|premium|enhanced/i.test(name)) score += 45;
    if (/google/i.test(name)) score += 20;
    if (naturalNames.test(name)) score += 28;

    var key = name.toLowerCase().split(' ')[0];
    if (nameBias[key]) score += nameBias[key];

    if (noveltyNames.test(name)) score -= 120;
    if (voice.localService === false) score += 6;

    return score;
  }

  function chooseVoice() {
    if (!hasSpeech) return null;

    var voices = window.speechSynthesis.getVoices();
    if (!voices || !voices.length) return null;

    var best = voices[0];
    var bestScore = scoreVoice(best);

    for (var i = 1; i < voices.length; i += 1) {
      var score = scoreVoice(voices[i]);
      if (score > bestScore) {
        best = voices[i];
        bestScore = score;
      }
    }

    return best;
  }

  function setSpeaking(next) {
    speaking = next;
    document.body.classList.toggle('is-speaking', next);
    speakBtn.disabled = next;
    stopBtn.disabled = !next;
  }

  function stopSpeech(announce) {
    if (!hasSpeech) return;

    speakToken += 1;
    pendingUtterances = 0;

    if (speaking || window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }

    setSpeaking(false);

    if (announce && speechStatus) {
      speechStatus.textContent = 'Speech stopped.';
    }
  }

  function speakMessage() {
    if (!hasSpeech) return;

    stopSpeech(false);

    var token = speakToken;
    var voice = chooseVoice();
    var chunks = originalLines.slice();

    pendingUtterances = chunks.length;
    setSpeaking(true);

    if (speechStatus) {
      speechStatus.textContent = 'Reading the message aloud.';
    }

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    // Queue synchronously so mobile browsers keep the tap's user activation.
    chunks.forEach(function (text) {
      var utterance = new window.SpeechSynthesisUtterance(text);
      utterance.rate = 0.97;
      utterance.pitch = 0.95;
      utterance.volume = 0.95;

      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = 'en-GB';
      }

      var finish = function () {
        if (token !== speakToken) return;
        pendingUtterances -= 1;

        if (pendingUtterances <= 0) {
          setSpeaking(false);
          if (speechStatus) speechStatus.textContent = 'Message finished.';
        }
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      if (token === speakToken) {
        window.speechSynthesis.speak(utterance);
      }
    });
  }

  if (!hasSpeech) {
    speakBtn.hidden = true;
    stopBtn.hidden = true;
    speechNote.hidden = false;
  }

  /* ---------------------------------------------------------------------
     Wiring
     --------------------------------------------------------------------- */

  beginBtn.addEventListener('click', begin);
  replayBtn.addEventListener('click', replay);
  speakBtn.addEventListener('click', speakMessage);
  stopBtn.addEventListener('click', function () {
    stopSpeech(true);
  });

  window.addEventListener('pagehide', function () {
    stopSpeech(false);
  });

  if (hasSpeech && typeof window.speechSynthesis.addEventListener === 'function') {
    // Warm the voice list on browsers that populate it asynchronously.
    window.speechSynthesis.addEventListener('voiceschanged', chooseVoice);
  }
})();
