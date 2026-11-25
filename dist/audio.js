/* Unlock the engine mix on a browser-authorized user gesture. */
(() => {
  'use strict';
  let sound,engineRpm=760;
  const preference='taylai.audio.muted';
  let enabled = true;
  try { enabled=localStorage.getItem(preference)!=='1'; } catch {}
  function setupMusic() {
    const button = document.getElementById('carMusic');
    if (!button) return;
    const track = document.getElementById('cabinTrack');
    const label = button.querySelector('.musicLabel');
    track.volume = .48;
    let selected = false;
    let driving = false;
    let playRequest = 0;

    function sync() {
      button.hidden = !driving;
      button.disabled = !enabled;
      button.setAttribute('aria-pressed', String(selected));
      label.textContent = selected ? 'Tắt nhạc' : 'Bật nhạc';
      button.title = enabled ? label.textContent : 'Bật âm thanh để nghe nhạc';
      const request = ++playRequest;
      if (!selected || !driving || !enabled || document.hidden) {
        track.pause();
        return;
      }
      track.play().catch(() => {
        if (request !== playRequest) return;
        selected = false;
        sync();
        document.getElementById('callout').textContent = 'Chưa phát được nhạc. Bấm Bật nhạc để thử lại.';
      });
    }

    button.addEventListener('click', () => {
      selected = !selected;
      if (selected) track.currentTime = 0;
      sync();
    });
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', () => {
      selected = false;
      sync();
    });
    sync();
    return {
      sync,
      setDriving(value) {
        if (driving === value) return;
        driving = value;
        sync();
      }
    };
  }
  const music = setupMusic();

  let nextTick = 0;
  let lowTick = false;
  let boosting = false;
  let voiceLine;
  function stopVoice() {
    if (voiceLine) window.speechSynthesis?.cancel();
    voiceLine = null;
  }
  function broadcast(line, radio) {
    if (!enabled) return;
    stopVoice();
    if (radio) {
      tone(392,392,.15,.09,0,'triangle');
      tone(494,494,.17,.08,.16,'triangle');
      tone(587,587,.26,.07,.34,'triangle');
    } else {
      tone(1210,1030,.21,.06);
      tone(1450,1280,.18,.045,.19);
    }
    const speech=window.speechSynthesis;
    const voice=speech?.getVoices().find(v=>/^vi\b/i.test(v.lang));
    if (!voice) return;
    const utterance=new SpeechSynthesisUtterance(line);
    utterance.voice=voice; utterance.lang='vi-VN'; utterance.volume=radio ? .82 : .67;
    utterance.rate=radio ? .96 : 1.03;
    utterance.onend=utterance.onerror=()=>{if(voiceLine===utterance)voiceLine=null;};
    voiceLine=utterance; speech.speak(utterance);
  }

  function makeCabin(ctx) {
    const output = ctx.createGain();
    output.gain.value = 0;
    output.connect(ctx.destination);

    const engine = ctx.createOscillator();
    // An uneven four-cylinder exhaust pulse, muffled by the cabin.
    const exhaustWave = ctx.createPeriodicWave(
      new Float32Array(9),
      Float32Array.of(0, .8, .54, .28, .09, .15, .05, .04, .025)
    );
    engine.setPeriodicWave(exhaustWave);
    const intake = ctx.createBiquadFilter();
    intake.type = 'lowpass';
    intake.Q.value = .58;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engine.connect(intake).connect(engineGain).connect(output);
    engine.start();

    const road = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.8), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let roughness = 0;
    for (let i = 0; i < data.length; i++) {
      roughness = .82 * roughness + .18 * (Math.random() * 2 - 1);
      data[i] = roughness;
    }
    road.buffer = buffer;
    road.loop = true;
    const tire = ctx.createBiquadFilter();
    tire.type = 'bandpass';
    tire.Q.value = .6;
    const roadGain = ctx.createGain();
    roadGain.gain.value = 0;
    road.connect(tire).connect(roadGain).connect(output);
    const rush = ctx.createBiquadFilter();
    rush.type = 'highpass';
    rush.Q.value = .55;
    const rushGain = ctx.createGain();
    rushGain.gain.value = 0;
    road.connect(rush).connect(rushGain).connect(output);
    // Reuse the tyre noise buffer. Two quiet, independently placed layers let
    // the listener hear the river on one side and the street on the other.
    function noiseLayer() {
      const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      const pan = ctx.createStereoPanner?.();
      filter.type = 'bandpass';
      filter.Q.value = .65;
      gain.gain.value = 0;
      road.connect(filter).connect(gain);
      if (pan) gain.connect(pan).connect(output);
      else gain.connect(output);
      return {filter, gain, pan};
    }
    const surroundings = noiseLayer(), shore = noiseLayer();
    const tread = ctx.createBiquadFilter(), treadGain = ctx.createGain();
    tread.type = 'bandpass';
    tread.Q.value = .75;
    treadGain.gain.value = 0;
    road.connect(tread).connect(treadGain).connect(output);
    const scrub = ctx.createOscillator();
    scrub.type = 'triangle';
    const scrubGain = ctx.createGain();
    scrubGain.gain.value = 0;
    scrub.connect(scrubGain).connect(output);
    scrub.start();
    road.start();

    return { ctx, output, engine, exhaustWave, electric:false, engineGain, intake, roadGain, tire, rush, rushGain, scrub, scrubGain, surroundings, shore, tread, treadGain,
      bikeVoices:[], axleVoices:new Set(), nextBikeSample:0, treadStation:0, treadTime:0 };
  }

  const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
  const unit = x => clamp(Number(x) || 0, 0, 1);
  function newBikeVoice() {
    const { ctx, output } = sound;
    if (!sound.bikeWave) {
      // One exhaust stroke per two revolutions of a small four-stroke engine.
      // A short pressure pulse and its quieter reflection give it a raspy edge.
      const real = new Float32Array(49), imag = new Float32Array(49);
      for (let i = 1; i < imag.length; i++) {
        const envelope = 1 / (1 + (i / 6) ** 1.7);
        real[i] = envelope * (.86 + .23 * Math.cos(i * 1.08));
        imag[i] = envelope * .23 * Math.sin(i * 1.08);
      }
      sound.bikeWave = ctx.createPeriodicWave(real, imag);
    }
    const motor = ctx.createOscillator(), filter = ctx.createBiquadFilter(), level = ctx.createGain();
    const position = ctx.createPanner();
    motor.setPeriodicWave(sound.bikeWave);
    filter.type = 'lowpass';
    filter.Q.value = .57;
    level.gain.value = 0;
    // The listener stays at the origin facing -Z. Our own attenuation accounts
    // for the quiet tail at the edge of the traffic simulation.
    position.panningModel = 'HRTF';
    position.rolloffFactor = 0;
    motor.connect(filter).connect(level).connect(position).connect(output);
    motor.onended = () => { motor.disconnect(); filter.disconnect(); level.disconnect(); position.disconnect(); };
    motor.start(ctx.currentTime);
    return { motor, filter, level, position, id:null };
  }

  function stopBike(voice, now) {
    voice.level.gain.cancelScheduledValues(now);
    voice.level.gain.setTargetAtTime(0, now, .015);
    voice.motor.stop(now + .08);
  }
  function hushTraffic() {
    if (!sound) return;
    const now = sound.ctx.currentTime;
    for (const voice of sound.bikeVoices) stopBike(voice, now);
    sound.bikeVoices.length = 0;
    sound.nextBikeSample = 0;
    for (const source of sound.axleVoices) source.stop();
    sound.axleVoices.clear();
  }
  function updateBikes(sample, place, now) {
    if (now < sound.nextBikeSample) return;
    sound.nextBikeSample = now + 1 / 15;
    const candidates = [];
    for (const actor of sample() || []) {
      const distance = Math.hypot(actor.right, actor.forward);
      if (actor.id != null && distance < 75) candidates.push({ actor, distance });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const loudest = candidates.slice(0, 2), voices = sound.bikeVoices;
    for (let i = voices.length - 1; i >= 0; i--) {
      const voice = voices[i];
      if (loudest.some(({actor}) => actor.id === voice.id)) continue;
      // Retain a silent slot briefly to reuse its HRTF on a change of actor.
      if (voice.id != null) {
        voice.level.gain.setTargetAtTime(0, now, .03);
        voice.id = null;
        voice.release = now + .4;
      } else if (now >= voice.release) {
        stopBike(voice, now);
        voices.splice(i, 1);
      }
    }
    const opening = place?.cabin ? unit(place.windowOpen) : 1;
    for (const {actor, distance} of loudest) {
      let voice = voices.find(v => v.id === actor.id);
      let start = now;
      if (!voice) {
        voice = voices.find(v => v.id == null);
        if (!voice) { voice = newBikeVoice(); voices.push(voice); }
        else start += .035;
        voice.id = actor.id;
      }
      const speed = Math.abs(actor.speed) || 0;
      const rpm = clamp(actor.rpm || 1550 + 4100 * (1 - Math.exp(-speed / 8.5)) + Math.max(0, speed - 11) * 95, 1200, 10500);
      const closing = clamp(actor.closing || 0, -75, 75);
      const doppler = 343 / (343 - closing);
      const pulse = rpm / 120 * doppler * (1 + .004 * Math.sin(now * 9 + speed));
      const behind = Math.max(0, -actor.forward / Math.max(1, distance));
      const cutoff = (1000 + 3400 * opening) / (1 + distance * .012 + behind * .65);
      const level = .43 * (.33 + .67 * opening) * (1 - distance / 75) ** 2 / (1 + distance / 6);
      voice.motor.frequency.setTargetAtTime(pulse, start, .042);
      voice.filter.frequency.setTargetAtTime(cutoff, start, .065);
      voice.level.gain.setTargetAtTime(level, start, .045);
      const { position } = voice;
      if (position.positionX) {
        position.positionX.setTargetAtTime(actor.right, start, .035);
        position.positionZ.setTargetAtTime(-actor.forward, start, .035);
      } else position.setPosition(actor.right, 0, -actor.forward);
    }
  }

  // Band centre, rolling level, grain band, grain level and joint spacing.
  // A periodic bump is appropriate on pavers and slabs, not on asphalt.
  const tireSurfaces = {
    asphalt:[260, 1, 900, 0, 0], roadConcrete:[390, .95, 1220, .11, 0],
    roadSlabs:[360, 1.04, 420, .23, 4.5], earth:[190, 1.22, 470, .29, 0],
    pavers:[240, 1.2, 560, .29, .23], roadWood:[195, 1.07, 360, .25, .34],
    roadMetal:[460, 1.08, 1740, .16, 0]
  };
  function updateTires(road, velocity, driving, braking, offroad, now) {
    const { tire, roadGain, tread, treadGain } = sound;
    const [hz, level, grainHz, grain, spacing] = tireSurfaces[offroad ? 'earth' : road?.surface] || tireSurfaces.asphalt;
    const wet = unit(road?.wet), rolling = driving ? velocity / 170 * (braking ? 1.5 : 1) : 0;
    sound.treadStation += (driving ? velocity / 3.6 : 0) * clamp(now - sound.treadTime, 0, .1);
    sound.treadTime = now;
    const seam = spacing ? Math.exp(-12 * (sound.treadStation % spacing) / spacing) : 0;
    tire.frequency.setTargetAtTime(offroad ? 230 + velocity * 2 : hz + velocity * 8, now, .16);
    roadGain.gain.setTargetAtTime(rolling * (road ? level : 1), now, .16);
    tread.frequency.setTargetAtTime(grainHz + (3200 - grainHz) * wet, now, .1);
    const air = road?.cabin ? .55 + .45 * unit(road.windowOpen) : 1;
    treadGain.gain.setTargetAtTime(road ? rolling * air * (grain * (1 + 2 * seam) + .74 * wet) : 0, now, .023);
  }

  function bridgeAxle(speedMps, rear = false, cabin = false) {
    if (!enabled || sound?.ctx.state !== 'running' || document.hidden || Math.abs(speedMps) < .12) return;
    const {ctx, output, axleVoices} = sound;
    if (!sound.jointBuffer) {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .16), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        const body = Math.sin(2 * Math.PI * (66 * t + .85 * (1 - Math.exp(-31 * t)))) * Math.exp(-33 * t);
        const click = (Math.random() * 2 - 1) * Math.exp(-245 * t);
        data[i] = (1 - Math.exp(-1500 * t)) * (.82 * body + .46 * click);
      }
      sound.jointBuffer = buffer;
    }
    if (axleVoices.size >= 4) return;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = sound.jointBuffer;
    source.playbackRate.value = rear ? .91 : 1.04;
    filter.type = 'lowpass';
    filter.frequency.value = cabin ? 1050 : 3600;
    gain.gain.value = (.055 + .29 * Math.min(1, Math.abs(speedMps) / 19)) * (rear ? .83 : 1);
    source.connect(filter).connect(gain).connect(output);
    axleVoices.add(source);
    source.onended = () => { axleVoices.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(ctx.currentTime);
  }

  let nextAmbient = 0, ambientActive = false;
  function hushAmbient() {
    if (!ambientActive || !sound) return;
    for (const layer of [sound.surroundings, sound.shore])
      layer.gain.gain.setTargetAtTime(0, sound.ctx.currentTime, .04);
    nextAmbient = 0;
    ambientActive = false;
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { hushAmbient(); hushTraffic(); } });
  window.addEventListener('pagehide', hushAmbient);
  window.addEventListener('pagehide', hushTraffic);

  function updateAmbient(sample, now, road) {
    if (!sample || document.hidden) { hushAmbient(); return; }
    if (now < nextAmbient) return;
    const place = sample();
    if (!place) { hushAmbient(); return; }
    ambientActive = true;
    nextAmbient = now + .3;
    const {surroundings, shore} = sound;
    const {kind, presence = 1, pan = 0, water = 0, waterPan = 0, rain = 0, cabin = false} = place;
    const volume = cabin ? .48 + .52 * unit(road?.windowOpen) : 1;
    const breeze = .65 + .22 * Math.sin(now * .73) + .13 * Math.sin(now * 1.27);
    const hz = kind === 'street' ? 240 : kind === 'works' ? 460 : 1700;
    surroundings.filter.frequency.setTargetAtTime(hz + (2900 - hz) * rain, now, .25);
    surroundings.gain.gain.setTargetAtTime(volume * (.20 * presence * breeze + .33 * rain), now, .25);
    surroundings.pan?.pan.setTargetAtTime(pan * (1 - rain), now, .2);
    shore.filter.frequency.setTargetAtTime(840 + 280 * breeze, now, .3);
    shore.gain.gain.setTargetAtTime(volume * water * (.25 + .2 * breeze), now, .25);
    shore.pan?.pan.setTargetAtTime(waterPan, now, .2);
  }

  function tone(frequency, endFrequency, length, volume, offset = 0, shape = 'sine') {
    if (!enabled || sound?.ctx.state !== 'running') return;
    const { ctx, output } = sound;
    const start = ctx.currentTime + offset;
    const source = ctx.createOscillator();
    const envelope = ctx.createGain();
    source.type = shape;
    source.frequency.setValueAtTime(frequency, start);
    source.frequency.exponentialRampToValueAtTime(endFrequency, start + length);
    envelope.gain.setValueAtTime(.00001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + .004);
    envelope.gain.exponentialRampToValueAtTime(.00001, start + length);
    source.connect(envelope).connect(output);
    source.start(start);
    source.stop(start + length + .01);
    source.onended = () => { source.disconnect(); envelope.disconnect(); };
  }

  function unlock() {
    if(!enabled)return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    try {
      if (!sound || sound.ctx.state === 'closed') sound = makeCabin(new Audio());
      const { ctx, output } = sound;
      if (enabled && ctx.state !== 'running') ctx.resume().catch(() => {});
      output.gain.setTargetAtTime(enabled ? .55 : 0, ctx.currentTime, .045);
    } catch {}
  }
  function toggle() {
    enabled=!enabled;
    if(!enabled){stopVoice();hushAmbient();hushTraffic();}
    try{localStorage.setItem(preference,enabled?'0':'1');}catch{}
    if(enabled)unlock();else if(sound)sound.output.gain.setTargetAtTime(0,sound.ctx.currentTime,.025);
    music?.sync();
    return enabled;
  }
  for(const event of ['pointerdown','keydown','click'])window.addEventListener(event,()=>{
    if(enabled&&sound?.ctx.state!=='running')unlock();
  },{capture:true});

  function update({ speed, throttle, braking, signal, mode, boost=false, slip=0, offroad=false, electric=false, ambience, roadSound, motorcycles }) {
    music?.setDriving(mode === 'driving');
    if(mode!=='driving'&&voiceLine)stopVoice();
    const driving = mode === 'driving';
    const velocity = Math.max(0, Math.min(190, speed || 0));
    const load = driving && throttle && !braking ? 1 : 0;
    const kmhPerThousandRpm = velocity < 19 ? 8.4 : velocity < 37 ? 14 : velocity < 58 ? 22 : 30;
    engineRpm = electric ? null : Math.max(760, velocity / kmhPerThousandRpm * 1000) + load * 260;
    if (!enabled || sound?.ctx.state !== 'running') return;
    const { ctx, engine, engineGain, intake, rush, rushGain, scrub, scrubGain } = sound;
    const now = ctx.currentTime;
    updateAmbient(ambience, now, roadSound);
    if (driving && !document.hidden && motorcycles) updateBikes(motorcycles, roadSound, now);
    else if (sound.bikeVoices.length || (!driving && sound.axleVoices.size)) hushTraffic();
    const onBoost = Boolean(driving && boost);
    const speedFraction = velocity / 190;
    const skid = driving && !offroad ? Math.max(0, Math.min(1, slip)) * Math.min(1, velocity / 24) : 0;
    if (onBoost && !boosting) tone(220, 790, .24, .042, 0, 'triangle');
    if (driving && boosting && !onBoost) tone(650, 110, .19, .037, 0, 'triangle');
    boosting = onBoost;
    rush.frequency.setTargetAtTime(onBoost ? 1450 : 450 + 700 * speedFraction, now, .11);
    rushGain.gain.setTargetAtTime(driving ? .61 * speedFraction ** 2 + (onBoost ? .94 : 0) : 0, now, .09);
    scrub.frequency.setTargetAtTime(520 + 315 * skid + Math.sin(now * 32) * 26, now, .04);
    scrubGain.gain.setTargetAtTime(skid ** 1.6 * .09, now, .05);
    if (sound.electric !== electric) {
      if (electric) engine.type = 'sine';
      else engine.setPeriodicWave(sound.exhaustWave);
      sound.electric = electric;
    }
    if (electric) {
      engine.frequency.setTargetAtTime(85 + velocity * 3.8, now, .12);
      intake.frequency.setTargetAtTime(1100, now, .12);
      engineGain.gain.setTargetAtTime(driving ? .034 * load + .014 * speedFraction : 0, now, .14);
    } else {
      engine.frequency.setTargetAtTime(engineRpm / 30 + Math.sin(now * 6.8) * .26, now, .12);
      intake.frequency.setTargetAtTime(145 + engineRpm * .067 + load * 145 + (onBoost ? 240 : 0), now, .12);
      engineGain.gain.setTargetAtTime(driving ? .068 + load * .038 : mode==='idling' ? .038 : 0, now, .14);
    }
    updateTires(roadSound, velocity, driving, braking, offroad, now);
    if (!driving || !signal) {
      nextTick = 0;
      lowTick = false;
    } else if (now >= nextTick) {
      tone(lowTick ? 660 : 830, 260, .023, .085, 0, 'triangle');
      lowTick = !lowTick;
      nextTick = now + .43;
    }
  }

  function cue(correct) {
    if (correct) {
      tone(622, 622, .095, .078);
      tone(831, 831, .15, .06, .075);
    } else {
      tone(330, 294, .18, .072);
    }
  }
  function souvenir(motif) {
    if (['echo','shell','ridge'].includes(motif)) {
      for (const [delay,volume] of [[0,.1],[.25,.05],[.51,.025]]) tone(392,388,.38,volume,delay);
    } else if (['drop','sail','turtle','lotus'].includes(motif)) {
      tone(370,660,.13,.07); tone(490,780,.18,.06,.15); tone(660,880,.3,.05,.36);
    } else if (['ink','gear','arch'].includes(motif)) {
      tone(146,82,.09,.09,0,'triangle'); tone(440,440,.21,.045,.12,'triangle');
    } else {
      tone(523,523,.3,.065); tone(659,659,.37,.055,.15); tone(784,784,.5,.045,.29);
    }
  }
  async function ignition(electric=false) {
    unlock();
    if (!enabled || !sound) return;
    try { await sound.ctx.resume(); } catch { return; }
    if(electric){cue(true);return;}
    for (let i=0;i<4;i++) tone(48+i*3,32+i*5,.085,.12,i*.073,'triangle');
    tone(44,96,.20,.16,.27,'sawtooth');
    tone(92,36,.36,.13,.46,'triangle');
  }
  function impact(strength,type) {
    if (!enabled || sound?.ctx.state !== 'running') return;
    strength=Math.min(1,Math.max(0,strength||0));
    if(!strength)return;
    if(type!=='water')tone(94,28,.14+strength*.15,.07+strength*.37);
    if(type==='person')return;
    if((type==='vehicle'||type==='car')&&strength>.4){
      tone(117,63,.17,.025+strength*.065,.06,'triangle');
      tone(1830,1270,.055,.012+strength*.023,.11);
      tone(1260,940,.046,.008+strength*.018,.18);
    }
    const {ctx,output}=sound, source=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), gain=ctx.createGain();
    const duration=type==='water'?.28+strength*.40:.12+strength*.28;
    const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate);
    const samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-5*i/samples.length);
    source.buffer=buffer;filter.type='bandpass';filter.frequency.value=type==='curb'?480:1500;filter.Q.value=.65;
    if(type==='water'){filter.type='lowpass';filter.frequency.setValueAtTime(3400,ctx.currentTime);filter.frequency.exponentialRampToValueAtTime(450,ctx.currentTime+duration);}
    gain.gain.value=.4+strength*.45;source.connect(filter).connect(gain).connect(output);source.start();
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  function backfire(){tone(175,46,.055,.18,0,'sawtooth');}
  window.driveAudio = { toggle, update, cue, ignition, impact, backfire, bridgeAxle, broadcast, souvenir, get enabled(){return enabled;}, get engineRpm(){return engineRpm;} };
})();
