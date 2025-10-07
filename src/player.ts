// VexTab Player
// Copyright 2012 Mohit Cheppudira <mohit@muthanna.com>
//
// This class is responsible for rendering the elements
// parsed by Vex.Flow.VexTab.

import * as Vex from '@aurokk/vexflow';

const Fraction = Vex.Flow.Fraction;
const RESOLUTION = Vex.Flow.RESOLUTION;
const Music = Vex.Flow.Music;

// Note: This file references external libraries that may need to be imported:
// - MIDI (from midi.js or similar)
// - paper (from paper.js)
// - jQuery (for $ usage)
// These are referenced as globals for now

declare const MIDI: any;
declare const paper: any;
declare const $: any;

interface PlayerOptions {
  instrument?: string;
  tempo?: number;
  show_controls?: boolean;
  soundfont_url?: string;
  overlay_class?: string;
}

interface TickNote {
  tick: any; // Fraction type from VexFlow
  value: number;
  notes: any[];
}

interface OverlayResult {
  paper: any;
  canvas: HTMLCanvasElement;
}

const INSTRUMENTS: { [key: string]: number } = {
  acoustic_grand_piano: 0,
  acoustic_guitar_nylon: 24,
  acoustic_guitar_steel: 25,
  electric_guitar_jazz: 26,
  distortion_guitar: 30,
  electric_bass_finger: 33,
  electric_bass_pick: 34,
  trumpet: 56,
  brass_section: 61,
  soprano_sax: 64,
  alto_sax: 65,
  tenor_sax: 66,
  baritone_sax: 67,
  flute: 73,
  synth_drum: 118,
};

function getOverlay(context: any, scale: number, overlay_class: string): OverlayResult {
  const canvas = context.canvas;
  const height = canvas.height;
  const width = canvas.width;

  const overlay = $('<canvas>');
  overlay.css('position', 'absolute');
  overlay.css('left', 0);
  overlay.css('top', 0);
  overlay.addClass(overlay_class);

  $(canvas).after(overlay);
  const ctx = (Vex.Flow as any).Renderer.getCanvasContext(overlay.get(0), width, height);
  ctx.scale(scale, scale);

  const ps = new paper.PaperScope();
  ps.setup(overlay.get(0));

  return {
    paper: ps,
    canvas: overlay.get(0),
  };
}

class Player {
  static DEBUG = false;
  static INSTRUMENTS_LOADED: { [key: string]: boolean } = {};

  private artist: any;
  private options: Required<PlayerOptions>;
  private interval_id: number | null = null;
  private paper: any = null;
  private tick_notes: { [key: string]: TickNote } = {};
  private all_ticks: TickNote[] = [];
  private tpm: number;
  private refresh_rate = 25; // ms: 50 = 20hz
  private ticks_per_refresh: number;
  private total_ticks: number | TickNote = 0;
  private marker?: any;
  private loading_message?: any;
  private play_button?: any;
  private stop_button?: any;
  private scale: number = 1;
  private current_ticks = 0;
  private next_event_tick = 0;
  private next_index = 0;
  private done = false;
  private loading = false;

  constructor(artist: any, options?: PlayerOptions) {
    this.L('Initializing player: ', options);
    this.artist = artist;

    this.options = {
      instrument: 'acoustic_grand_piano',
      tempo: 120,
      show_controls: true,
      soundfont_url: '/soundfont/',
      overlay_class: 'vextab-player',
    };

    if (options) {
      Object.assign(this.options, options);
    }

    this.L(`Using soundfonts in: ${this.options.soundfont_url}`);
    this.tpm = this.options.tempo * (RESOLUTION / 4);
    this.ticks_per_refresh = this.tpm / (60 * (1000 / this.refresh_rate));
    this.reset();
  }

  private L(...args: any[]): void {
    if (Player.DEBUG) {
      console?.log('(Vex.Flow.Player)', ...args);
    }
  }

  setArtist(artist: any): void {
    this.artist = artist;
    this.reset();
  }

  setTempo(tempo: number): void {
    this.L('New tempo: ', tempo);
    this.options.tempo = tempo;
    this.reset();
  }

  setInstrument(instrument: string): void {
    this.L('New instrument: ', instrument);
    if (!(instrument in INSTRUMENTS)) {
      throw new (Vex as any).RERR('PlayerError', 'Invalid instrument: ' + instrument);
    }
    this.options.instrument = instrument;
    this.reset();
  }

  reset(): void {
    this.artist.attachPlayer(this);
    this.tick_notes = {};
    this.all_ticks = [];
    this.tpm = this.options.tempo * (RESOLUTION / 4);
    this.refresh_rate = 25; // ms: 50 = 20hz
    this.ticks_per_refresh = this.tpm / (60 * (1000 / this.refresh_rate));
    this.total_ticks = 0;

    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }

    this.stop();
  }

  removeControls(): void {
    if (this.play_button) {
      this.play_button.remove();
    }
    if (this.stop_button) {
      this.stop_button.remove();
    }
    if (this.paper) {
      this.paper.view.draw();
    }
  }

  render(): void {
    this.reset();
    const data = this.artist.getPlayerData();
    this.scale = data.scale;

    if (!this.paper) {
      const overlay = getOverlay(data.context, data.scale, this.options.overlay_class);
      this.paper = overlay.paper;
    }

    this.marker = new this.paper.Path.Rectangle(0, 0, 13, 85);
    this.loading_message = new this.paper.PointText(35, 12);

    if (this.options.show_controls) {
      this.play_button = new this.paper.Path.RegularPolygon(
        new this.paper.Point(25, 10),
        3,
        7,
        7
      );
      this.play_button.fillColor = '#396';
      this.play_button.opacity = 0.8;
      this.play_button.rotate(90);
      this.play_button.onMouseUp = (event: any) => {
        this.play();
      };

      this.stop_button = new this.paper.Path.Rectangle(3, 3, 10, 10);
      this.stop_button.fillColor = '#396';
      this.stop_button.opacity = 0.8;
      this.stop_button.onMouseUp = (event: any) => {
        this.stop();
      };
    }

    this.paper.view.draw();
    const staves = data.voices;

    const total_ticks = new Fraction(0, 1);
    for (const voice_group of staves) {
      const max_voice_tick = new Fraction(0, 1);

      for (let i = 0; i < voice_group.length; i++) {
        const voice = voice_group[i];
        const total_voice_ticks = new Fraction(0, 1);

        for (const note of voice.getTickables()) {
          if (!note.shouldIgnoreTicks()) {
            const abs_tick = total_ticks.clone();
            abs_tick.add(total_voice_ticks);
            abs_tick.simplify();
            const key = abs_tick.toString();

            if (key in this.tick_notes) {
              this.tick_notes[key].notes.push(note);
            } else {
              this.tick_notes[key] = {
                tick: abs_tick,
                value: abs_tick.value(),
                notes: [note],
              };
            }

            total_voice_ticks.add(note.getTicks());
          }
        }

        if (total_voice_ticks.value() > max_voice_tick.value()) {
          max_voice_tick.copy(total_voice_ticks);
        }
      }

      total_ticks.add(max_voice_tick);
    }

    // Sort tick notes by value
    this.all_ticks = Object.values(this.tick_notes)
      .sort((a, b) => a.value - b.value);

    this.total_ticks = this.all_ticks[this.all_ticks.length - 1];
    this.L(this.all_ticks);
  }

  updateMarker(x: number, y: number): void {
    this.marker.fillColor = '#369';
    this.marker.opacity = 0.2;
    this.marker.setPosition(new this.paper.Point(x * this.scale, y * this.scale));
    this.paper.view.draw();
  }

  playNote(notes: any[]): void {
    this.L(`(${this.current_ticks}) playNote: `, notes);

    for (const note of notes) {
      const x = note.getAbsoluteX() + 4;
      const y = note.getStave().getYForLine(2);

      if (this.paper) {
        this.updateMarker(x, y);
      }

      if (note.isRest()) {
        continue;
      }

      const keys = note.getPlayNote();
      const duration = note.getTicks().value() / (this.tpm / 60);

      for (const key of keys) {
        const [noteStr, octaveStr] = key.split('/');
        const noteName = noteStr.trim().toLowerCase();
        const octave = parseInt(octaveStr, 10);
        const note_value = Music.noteValues[noteName];

        if (!note_value) {
          continue;
        }

        const midi_note = 24 + octave * 12 + Music.noteValues[noteName].int_val;
        MIDI.noteOn(0, midi_note, 127, 0);
        MIDI.noteOff(0, midi_note, duration);
      }
    }
  }

  refresh(): void {
    if (this.done) {
      this.stop();
      return;
    }

    this.current_ticks += this.ticks_per_refresh;

    if (this.current_ticks >= this.next_event_tick && this.all_ticks.length > 0) {
      this.playNote(this.all_ticks[this.next_index].notes);
      this.next_index++;

      if (this.next_index >= this.all_ticks.length) {
        this.done = true;
      } else {
        this.next_event_tick = this.all_ticks[this.next_index].tick.value();
      }
    }
  }

  stop(): void {
    this.L('Stop');

    if (this.interval_id !== null && typeof window !== 'undefined') {
      window.clearInterval(this.interval_id);
    }

    if (this.play_button) {
      this.play_button.fillColor = '#396';
    }

    if (this.paper) {
      this.paper.view.draw();
    }

    this.interval_id = null;
    this.current_ticks = 0;
    this.next_event_tick = 0;
    this.next_index = 0;
    this.done = false;
  }

  start(): void {
    this.stop();
    this.L('Start');

    if (this.play_button) {
      this.play_button.fillColor = '#a36';
    }

    MIDI.programChange(0, INSTRUMENTS[this.options.instrument]);
    this.render(); // try to update, maybe notes were changed dynamically
    if (typeof window !== 'undefined') {
      this.interval_id = window.setInterval(() => this.refresh(), this.refresh_rate);
    }
  }

  play(): void {
    this.L('Play: ', this.refresh_rate, this.ticks_per_refresh);

    if (Player.INSTRUMENTS_LOADED[this.options.instrument] && !this.loading) {
      this.start();
    } else {
      this.L('Loading instruments...');
      this.loading_message.content = 'Loading instruments...';
      this.loading_message.fillColor = 'green';
      this.loading = true;
      this.paper.view.draw();

      MIDI.loadPlugin({
        soundfontUrl: this.options.soundfont_url,
        instruments: [this.options.instrument],
        callback: () => {
          Player.INSTRUMENTS_LOADED[this.options.instrument] = true;
          this.loading = false;
          this.loading_message.content = '';
          this.start();
        },
      });
    }
  }
}

export default Player;
