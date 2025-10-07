// VexTab Artist
// Copyright 2012 Mohit Cheppudira <mohit@muthanna.com>
//
// This class is responsible for rendering the elements
// parsed by Vex.Flow.VexTab.

import * as Vex from '@aurokk/vexflow';
import * as _ from 'lodash';

class Artist {
  static DEBUG = false;
  static NOLOGO = false;

  x: number;
  y: number;
  width: number;
  options: any;
  tuning: any;
  key_manager: any;
  music_api: any;
  customizations: any;
  staves: any[];
  tab_articulations: any[];
  stave_articulations: any[];
  player_voices: any[];
  last_y: number;
  current_duration: string;
  current_clef: string;
  current_bends: any;
  current_octave_shift: number;
  bend_start_index: number | null;
  bend_start_strings: any;
  rendered: boolean;
  renderer_context: any;
  player: any;

  constructor(x: number, y: number, width: number, options?: any) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.options = {
      font_face: "Arial",
      font_size: 10,
      font_style: null,
      bottom_spacing: 20 + (Artist.NOLOGO ? 0 : 10),
      tab_stave_lower_spacing: 10,
      note_stave_lower_spacing: 0,
      scale: 1.0
    };
    if (options != null) {
      _.extend(this.options, options);
    }
    this.reset();
  }

  reset(): void {
    this.tuning = new Vex.Flow.Tuning();
    this.key_manager = new Vex.Flow.KeyManager("C");
    this.music_api = new Vex.Flow.Music();

    // User customizations
    this.customizations = {
      "font-size": this.options.font_size,
      "font-face": this.options.font_face,
      "font-style": this.options.font_style,
      "annotation-position": "bottom",
      "scale": this.options.scale,
      "width": this.width,
      "stave-distance": 0,
      "space": 0,
      "player": "false",
      "tempo": 120,
      "instrument": "acoustic_grand_piano",
      "accidentals": "standard",  // standard / cautionary
      "tab-stems": "false",
      "tab-stem-direction": "up",
      "beam-rests": "true",
      "beam-stemlets": "true",
      "beam-middle-only": "false",
      "connector-space": 5
    };

    // Generated elements
    this.staves = [];
    this.tab_articulations = [];
    this.stave_articulations = [];

    // Voices for player
    this.player_voices = [];

    // Current state
    this.last_y = this.y;
    this.current_duration = "q";
    this.current_clef = "treble";
    this.current_bends = {};
    this.current_octave_shift = 0;
    this.bend_start_index = null;
    this.bend_start_strings = null;
    this.rendered = false;
    this.renderer_context = null;
  }

  attachPlayer(player: any): void {
    this.player = player;
  }

  setOptions(options: any): void {
    L("setOptions: ", options);
    // Set this.customizations
    const valid_options = _.keys(this.customizations);
    for (const k in options) {
      const v = options[k];
      if (valid_options.includes(k)) {
        this.customizations[k] = v;
      } else {
        throw new Vex.RuntimeError("ArtistError", `Invalid option '${k}'`);
      }
    }

    this.last_y += parseInt(this.customizations.space, 10);
    if (this.customizations.player === "true") {
      this.last_y += 15;
    }
  }

  getPlayerData(): any {
    return {
      voices: this.player_voices,
      context: this.renderer_context,
      scale: this.customizations.scale
    };
  }

  render(renderer: any): void {
    L("Render: ", this.options);
    this.closeBends();
    renderer.resize(this.customizations.width * this.customizations.scale,
        (this.last_y + this.options.bottom_spacing) * this.customizations.scale);
    const ctx = renderer.getContext();
    ctx.clear();
    ctx.scale(this.customizations.scale, this.customizations.scale);
    ctx.setFont(this.options.font_face, this.options.font_size, "");

    this.renderer_context = ctx;

    const setBar = (stave: any, notes: any[]) => {
      const last_note = _.last(notes);
      if (last_note instanceof Vex.Flow.BarNote) {
        notes.pop();
        stave.setEndBarType(last_note.getType());
        stave.formatted = true;
      }
    };

    for (const stave of this.staves) {
      L("Rendering staves.");
      // If the last note is a bar, then remove it and render it as a stave modifier.
      if (stave.tab != null) {
        setBar(stave.tab, stave.tab_notes);
      }
      if (stave.note != null) {
        setBar(stave.note, stave.note_notes);
      }

      if (stave.tab != null) {
        stave.tab.setContext(ctx).draw();
      }
      if (stave.note != null) {
        stave.note.setContext(ctx).draw();
      }

      stave.tab_voices.push(stave.tab_notes);
      stave.note_voices.push(stave.note_notes);

      const voices = formatAndRender(ctx,
                      stave.tab != null ? {stave: stave.tab, voices: stave.tab_voices} : null,
                      stave.note != null ? {stave: stave.note, voices: stave.note_voices} : null,
                      stave.text_voices,
                      this.customizations,
                      {beam_groups: stave.beam_groups});

      this.player_voices.push(voices);
    }

    L("Rendering tab articulations.");
    for (const articulation of this.tab_articulations) {
      articulation.setContext(ctx).draw();
    }

    L("Rendering note articulations.");
    for (const articulation of this.stave_articulations) {
      articulation.setContext(ctx).draw();
    }

    if (this.player != null) {
      if (this.customizations.player === "true") {
        this.player.setTempo(parseInt(this.customizations.tempo, 10));
        this.player.setInstrument(this.customizations.instrument);
        this.player.render();
      } else {
        this.player.removeControls();
      }
    }
    this.rendered = true;

    if (!Artist.NOLOGO) {
      const LOGO = "vexflow.com";
      const width = ctx.measureText(LOGO).width;
      ctx.save();
      ctx.setFont("Times", 10, "italic");
      ctx.fillText(LOGO, (this.customizations.width - width) / 2, this.last_y + 25);
      ctx.restore();
    }
  }

  isRendered(): boolean {
    return this.rendered;
  }

  draw(renderer: any): void {
    this.render(renderer);
  }

  // Given a fret/string pair, returns a note, octave, and required accidentals
  // based on current guitar tuning and stave key. The accidentals may be different
  // for repeats of the same notes because they get set (or cancelled) by the Key
  // Manager.
  getNoteForFret(fret: any, string: any): [string, number, string | null] {
    const spec = this.tuning.getNoteForFret(fret, string);
    const spec_props = Vex.Flow.keyProperties(spec);

    const selected_note = this.key_manager.selectNote(spec_props.key);
    let accidental: string | null = null;

    // Do we need to specify an explicit accidental?
    switch (this.customizations.accidentals) {
      case "standard":
        if (selected_note.change) {
          accidental = selected_note.accidental != null ? selected_note.accidental : "n";
        }
        break;
      case "cautionary":
        if (selected_note.change) {
          accidental = selected_note.accidental != null ? selected_note.accidental : "n";
        } else {
          accidental = selected_note.accidental != null ? selected_note.accidental + "_c" : null;
        }
        break;
      default:
        throw new Vex.RuntimeError("ArtistError", `Invalid value for option 'accidentals': ${this.customizations.accidentals}`);
    }

    const new_note = selected_note.note;
    let new_octave = spec_props.octave;

    // TODO(0xfe): This logic should probably be in the KeyManager code
    const old_root = this.music_api.getNoteParts(spec_props.key).root;
    const new_root = this.music_api.getNoteParts(selected_note.note).root;

    // Figure out if there's an octave shift based on what the Key
    // Manager just told us about the note.
    if (new_root === "b" && old_root === "c") {
      new_octave--;
    } else if (new_root === "c" && old_root === "b") {
      new_octave++;
    }

    return [new_note, new_octave, accidental];
  }

  getNoteForABC(abc: any, string: any): [string, any, string | null] {
    const key = abc.key;
    const octave = string;
    let accidental = abc.accidental;
    if (abc.accidental_type != null) {
      accidental += `_${abc.accidental_type}`;
    }
    return [key, octave, accidental];
  }

  addStaveNote(note_params: any): void {
    const params: any = {
      is_rest: false,
      play_note: null
    };

    _.extend(params, note_params);
    const stave_notes = _.last(this.staves).note_notes;
    const stave_note = new Vex.Flow.StaveNote({
      keys: params.spec,
      duration: this.current_duration + (params.is_rest ? "r" : ""),
      clef: params.is_rest ? "treble" : this.current_clef,
      auto_stem: params.is_rest ? false : true
    });

    for (let index = 0; index < params.accidentals.length; index++) {
      const acc = params.accidentals[index];
      if (acc != null) {
        const parts = acc.split("_");
        const new_accidental = new Vex.Flow.Accidental(parts[0]);

        if (parts.length > 1 && parts[1] === "c") {
          new_accidental.setAsCautionary();
        }

        stave_note.addModifier(new_accidental, index);
      }
    }

    if (this.current_duration[this.current_duration.length - 1] === "d") {
      Vex.Dot.buildAndAttach([stave_note], {all: true});
    }

    if (params.play_note != null) {
      stave_note.setPlayNote(params.play_note);
    }
    stave_notes.push(stave_note);
  }

  addTabNote(spec: any, play_note: any = null): void {
    const tab_notes = _.last(this.staves).tab_notes;
    const new_tab_note = new Vex.Flow.TabNote({
      positions: spec,
      duration: this.current_duration
    }, (this.customizations["tab-stems"] === "true"));

    if (play_note != null) {
      new_tab_note.setPlayNote(play_note);
    }
    tab_notes.push(new_tab_note);

    if (this.current_duration[this.current_duration.length - 1] === "d") {
      Vex.Dot.buildAndAttach([new_tab_note]);
    }
  }

  setDuration(time: string, dot: boolean = false): void {
    const t = time.split(/\s+/);
    L("setDuration: ", t[0], dot);
    this.current_duration = makeDuration(t[0], dot);
  }

  addBar(type: string): void {
    L("addBar: ", type);
    this.closeBends();
    this.key_manager.reset();
    const stave = _.last(this.staves);

    const TYPE = Vex.Flow.Barline.type;
    let barType: any;
    switch (type) {
      case "single":
        barType = TYPE.SINGLE;
        break;
      case "double":
        barType = TYPE.DOUBLE;
        break;
      case "end":
        barType = TYPE.END;
        break;
      case "repeat-begin":
        barType = TYPE.REPEAT_BEGIN;
        break;
      case "repeat-end":
        barType = TYPE.REPEAT_END;
        break;
      case "repeat-both":
        barType = TYPE.REPEAT_BOTH;
        break;
      default:
        barType = TYPE.SINGLE;
    }

    const bar_note = new Vex.Flow.BarNote().setType(barType);
    stave.tab_notes.push(bar_note);
    if (stave.note != null) {
      stave.note_notes.push(bar_note);
    }
  }

  openBends(first_note: any, last_note: any, first_indices: any[], last_indices: any[]): void {
    L("openBends", first_note, last_note, first_indices, last_indices);
    const tab_notes = _.last(this.staves).tab_notes;

    let start_note = first_note;
    let start_indices = first_indices;
    if (_.isEmpty(this.current_bends)) {
      this.bend_start_index = tab_notes.length - 2;
      this.bend_start_strings = first_indices;
    } else {
      start_note = tab_notes[this.bend_start_index];
      start_indices = this.bend_start_strings;
    }

    const first_frets = start_note.getPositions();
    const last_frets = last_note.getPositions();
    for (let i = 0; i < start_indices.length; i++) {
      const index = start_indices[i];
      const last_index = last_indices[i];
      const from_fret = first_note.getPositions()[first_indices[i]];
      const to_fret = last_frets[last_index];
      if (this.current_bends[index] == null) {
        this.current_bends[index] = [];
      }
      this.current_bends[index].push(makeBend(from_fret.fret, to_fret.fret));
    }
  }

  // Close and apply all the bends to the last N notes.
  closeBends(offset: number = 1): void {
    if (this.bend_start_index == null) return;
    L(`closeBends(${offset})`);
    const tab_notes = _.last(this.staves).tab_notes;
    for (const k in this.current_bends) {
      const v = this.current_bends[k];
      const phrase = [];
      for (const bend of v) {
        phrase.push(bend);
      }
      tab_notes[this.bend_start_index].addModifier(
        new Vex.Flow.Bend(null, null, phrase), parseInt(k, 10));
    }

    // Replace bent notes with ghosts (make them invisible)
    const start_idx = this.bend_start_index + 1;
    const end_idx = (tab_notes.length - 2) + offset;
    for (let i = start_idx; i <= end_idx; i++) {
      const tab_note = tab_notes[i];
      tab_note.setGhost(true);
    }

    this.current_bends = {};
    this.bend_start_index = null;
  }

  makeTuplets(tuplets: number, notes?: number): void {
    L("makeTuplets", tuplets, notes);
    if (notes == null) {
      notes = tuplets;
    }
    if (!_.last(this.staves).note) return;
    const stave_notes = _.last(this.staves).note_notes;
    const tab_notes = _.last(this.staves).tab_notes;

    if (stave_notes.length < notes) {
      throw new Vex.RuntimeError("ArtistError", "Not enough notes for tuplet");
    }
    const modifier = new Vex.Flow.Tuplet(stave_notes.slice(stave_notes.length - notes), {num_notes: tuplets});
    this.stave_articulations.push(modifier);

    // Creating a Vex.Flow.Tuplet corrects the ticks for the notes, so it needs to
    // be created whether or not it gets rendered. Below, if tab stems are not required
    // the created tuplet is simply thrown away.
    const tab_modifier = new Vex.Flow.Tuplet(tab_notes.slice(tab_notes.length - notes), {num_notes: tuplets});
    if (this.customizations["tab-stems"] === "true") {
      this.tab_articulations.push(tab_modifier);
    }
  }

  makeFingering(text: string): any[] | null {
    const parts = getFingering(text);
    const POS = Vex.Flow.Modifier.Position;
    let fingers: string[] = [];
    const fingering: any[] = [];

    if (parts != null) {
      fingers = parts[1].split(/-/).map((p: string) => p.trim());
    } else {
      return null;
    }

    const badFingering = () => new Vex.RuntimeError("ArtistError", `Bad fingering: ${parts[1]}`);

    for (const finger of fingers) {
      const pieces = finger.match(/(\d+):([ablr]):([fs]):([^-.]+)/);
      if (!pieces) {
        throw badFingering();
      }

      const note_number = parseInt(pieces[1], 10) - 1;
      let position = POS.RIGHT;
      switch (pieces[2]) {
        case "l":
          position = POS.LEFT;
          break;
        case "r":
          position = POS.RIGHT;
          break;
        case "a":
          position = POS.ABOVE;
          break;
        case "b":
          position = POS.BELOW;
          break;
      }

      let modifier = null;
      const number = pieces[4];
      switch (pieces[3]) {
        case "s":
          modifier = new Vex.Flow.StringNumber(number).setPosition(position);
          break;
        case "f":
          modifier = new Vex.Flow.FretHandFinger(number).setPosition(position);
          break;
      }

      fingering.push({num: note_number, modifier: modifier});
    }

    return fingering;
  }

  makeStroke(text: string): any | null {
    const parts = getStrokeParts(text);
    const TYPE = Vex.Flow.Stroke.Type;
    let type = null;

    if (parts != null) {
      switch (parts[1]) {
        case "bu":
          type = TYPE.BRUSH_UP;
          break;
        case "bd":
          type = TYPE.BRUSH_DOWN;
          break;
        case "ru":
          type = TYPE.ROLL_UP;
          break;
        case "rd":
          type = TYPE.ROLL_DOWN;
          break;
        case "qu":
          type = TYPE.RASQUEDO_UP;
          break;
        case "qd":
          type = TYPE.RASQUEDO_DOWN;
          break;
        default:
          throw new Vex.RuntimeError("ArtistError", `Invalid stroke type: ${parts[1]}`);
      }
      return new Vex.Flow.Stroke(type);
    } else {
      return null;
    }
  }

  makeScoreArticulation(text: string): any | null {
    const parts = getScoreArticulationParts(text);
    if (parts != null) {
      const type = parts[1];
      const position = parts[2];

      const POSTYPE = Vex.Flow.Modifier.Position;
      const pos = position === "t" ? POSTYPE.ABOVE : POSTYPE.BELOW;
      return new Vex.Flow.Articulation(type).setPosition(pos);
    } else {
      return null;
    }
  }

  makeAnnotation(text: string): any | null {
    let font_face = this.customizations["font-face"];
    let font_size = this.customizations["font-size"];
    let font_style = this.customizations["font-style"];
    const aposition = this.customizations["annotation-position"];

    const VJUST = Vex.Flow.Annotation.VerticalJustify;
    const default_vjust = aposition === "top" ? VJUST.TOP : VJUST.BOTTOM;

    const makeIt = (text: string, just: any = default_vjust) => {
      return new Vex.Flow.Annotation(text)
        .setFont(font_face, font_size, font_style)
        .setVerticalJustification(just);
    };

    let parts = text.match(/^\.([^-]*)-([^-]*)-([^.]*)\.(.*)$/);
    if (parts != null) {
      font_face = parts[1];
      font_size = parts[2];
      font_style = parts[3];
      text = parts[4];
      return text ? makeIt(text) : null;
    }

    parts = text.match(/^\.([^.]*)\.(.*)$/);
    if (parts != null) {
      let just = default_vjust;
      text = parts[2];
      switch (parts[1]) {
        case "big":
          font_style = "bold";
          font_size = "14";
          break;
        case "italic":
        case "italics":
          font_face = "Times";
          font_style = "italic";
          break;
        case "medium":
          font_size = "12";
          break;
        case "top":
          just = VJUST.TOP;
          this.customizations["annotation-position"] = "top";
          break;
        case "bottom":
          just = VJUST.BOTTOM;
          this.customizations["annotation-position"] = "bottom";
          break;
      }
      return text ? makeIt(text, just) : null;
    }

    return makeIt(text);
  }

  addAnnotations(annotations: string[]): void {
    const stave = _.last(this.staves);
    const stave_notes = stave.note_notes;
    const tab_notes = stave.tab_notes;

    if (annotations.length > tab_notes.length) {
      throw new Vex.RuntimeError("ArtistError", "More annotations than note elements");
    }

    // Add text annotations
    if (stave.tab) {
      const start_idx = tab_notes.length - annotations.length;
      for (let i = 0; i < annotations.length; i++) {
        const tab_note = tab_notes[start_idx + i];
        if (getScoreArticulationParts(annotations[i])) {
          const score_articulation = this.makeScoreArticulation(annotations[i]);
          tab_note.addModifier(score_articulation, 0);
        } else if (getStrokeParts(annotations[i])) {
          const stroke = this.makeStroke(annotations[i]);
          tab_note.addModifier(stroke, 0);
        } else {
          const annotation = this.makeAnnotation(annotations[i]);
          if (annotation) {
            tab_note.addModifier(this.makeAnnotation(annotations[i]), 0);
          }
        }
      }
    } else {
      const start_idx = stave_notes.length - annotations.length;
      for (let i = 0; i < annotations.length; i++) {
        const note = stave_notes[start_idx + i];
        if (!getScoreArticulationParts(annotations[i])) {
          const annotation = this.makeAnnotation(annotations[i]);
          if (annotation) {
            note.addAnnotation(0, this.makeAnnotation(annotations[i]));
          }
        }
      }
    }

    // Add glyph articulations, strokes, or fingerings on score
    if (stave.note) {
      const start_idx = stave_notes.length - annotations.length;
      for (let i = 0; i < annotations.length; i++) {
        const note = stave_notes[start_idx + i];
        const score_articulation = this.makeScoreArticulation(annotations[i]);
        if (score_articulation != null) {
          note.addModifier(score_articulation, 0);
        }

        const stroke = this.makeStroke(annotations[i]);
        if (stroke != null) {
          note.addStroke(0, stroke);
        }

        const fingerings = this.makeFingering(annotations[i]);
        if (fingerings != null) {
          try {
            for (const fingering of fingerings) {
              note.addModifier(fingering.modifier, fingering.num);
            }
          } catch (e) {
            console.log(e);
            throw new Vex.RuntimeError("ArtistError", `Bad note number in fingering: ${annotations[i]}`);
          }
        }
      }
    }
  }

  addTabArticulation(type: string, first_note: any, last_note: any, first_indices: any[], last_indices: any[]): void {
    L("addTabArticulations: ", type, first_note, last_note, first_indices, last_indices);

    if (type === "t") {
      last_note.addModifier(
        new Vex.Flow.Annotation("T")
          .setVerticalJustification(Vex.Flow.Annotation.VerticalJustify.BOTTOM));
    }

    if (_.isEmpty(first_indices) && _.isEmpty(last_indices)) return;

    let articulation = null;

    if (type === "s") {
      articulation = new Vex.Flow.TabSlide({
        first_note: first_note,
        last_note: last_note,
        first_indices: first_indices,
        last_indices: last_indices
      });
    }

    if (["h", "p"].includes(type)) {
      articulation = new Vex.Flow.TabTie({
        first_note: first_note,
        last_note: last_note,
        first_indices: first_indices,
        last_indices: last_indices
      }, type.toUpperCase());
    }

    if (["T", "t"].includes(type)) {
      articulation = new Vex.Flow.TabTie({
        first_note: first_note,
        last_note: last_note,
        first_indices: first_indices,
        last_indices: last_indices
      }, " ");
    }

    if (type === "b") {
      this.openBends(first_note, last_note, first_indices, last_indices);
    }

    if (articulation != null) {
      this.tab_articulations.push(articulation);
    }
  }

  addStaveArticulation(type: string, first_note: any, last_note: any, first_indices: any[], last_indices: any[]): void {
    L("addStaveArticulations: ", type, first_note, last_note, first_indices, last_indices);
    let articulation = null;
    if (["b", "s", "h", "p", "t", "T"].includes(type)) {
      articulation = new Vex.Flow.StaveTie({
        first_note: first_note,
        last_note: last_note,
        first_indices: first_indices,
        last_indices: last_indices
      });
    }

    if (articulation != null) {
      this.stave_articulations.push(articulation);
    }
  }

  // This gets the previous (second-to-last) non-bar non-ghost note.
  getPreviousNoteIndex(): number {
    const tab_notes = _.last(this.staves).tab_notes;
    let index = 2;
    while (index <= tab_notes.length) {
      const note = tab_notes[tab_notes.length - index];
      if (note instanceof Vex.Flow.TabNote) {
        return tab_notes.length - index;
      }
      index++;
    }

    return -1;
  }

  addDecorator(decorator: string | null | undefined): void {
    L("addDecorator: ", decorator);
    if (decorator == null) return;

    const stave = _.last(this.staves);
    const tab_notes = stave.tab_notes;
    const score_notes = stave.note_notes;
    let modifier = null;
    let score_modifier = null;

    if (decorator === "v") {
      modifier = new Vex.Flow.Vibrato();
    }
    if (decorator === "V") {
      modifier = new Vex.Flow.Vibrato().setHarsh(true);
    }
    if (decorator === "u") {
      modifier = new Vex.Flow.Articulation("a|").setPosition(Vex.Flow.Modifier.Position.BELOW);
      score_modifier = new Vex.Flow.Articulation("a|").setPosition(Vex.Flow.Modifier.Position.BELOW);
    }
    if (decorator === "d") {
      modifier = new Vex.Flow.Articulation("am").setPosition(Vex.Flow.Modifier.Position.BELOW);
      score_modifier = new Vex.Flow.Articulation("am").setPosition(Vex.Flow.Modifier.Position.BELOW);
    }

    if (modifier != null) {
      (_.last(tab_notes) as any).addModifier(modifier, 0);
    }
    if (score_modifier != null && _.last(score_notes) != null) {
      (_.last(score_notes) as any).addModifier(score_modifier, 0);
    }
  }

  addArticulations(articulations: any[]): void {
    L("addArticulations: ", articulations);
    const stave = _.last(this.staves);
    const tab_notes = stave.tab_notes;
    const stave_notes = stave.note_notes;
    if (_.isEmpty(tab_notes) || _.isEmpty(articulations)) {
      this.closeBends(0);
      return;
    }

    const current_tab_note = _.last(tab_notes);

    let has_bends = false;
    const valid_articulations = ["b", "s", "h", "p", "t", "T", "v", "V"];
    for (const valid_articulation of valid_articulations) {
      const indices: number[] = [];
      for (let i = 0; i < articulations.length; i++) {
        const art = articulations[i];
        if (art != null && art === valid_articulation) {
          indices.push(i);
        }
      }
      if (_.isEmpty(indices)) continue;

      if (valid_articulation === "b") has_bends = true;
      const prev_index = this.getPreviousNoteIndex();
      let prev_tab_note = null;
      let prev_indices = null;
      let current_indices = null;

      if (prev_index === -1) {
        prev_tab_note = null;
        prev_indices = null;
      } else {
        prev_tab_note = tab_notes[prev_index];
        // Figure out which strings the articulations are on
        const this_strings: number[] = [];
        const positions = (current_tab_note as any).getPositions();
        for (let i = 0; i < positions.length; i++) {
          const n = positions[i];
          if (indices.includes(i)) {
            this_strings.push(n.str);
          }
        }

        // Only allows articulations where both notes are on the same strings
        const valid_strings: number[] = [];
        const prev_positions = prev_tab_note.getPositions();
        for (const pos of prev_positions) {
          if (this_strings.includes(pos.str)) {
            valid_strings.push(pos.str);
          }
        }

        // Get indices of articulated notes on previous chord
        prev_indices = [];
        for (let i = 0; i < prev_positions.length; i++) {
          const n = prev_positions[i];
          if (valid_strings.includes(n.str)) {
            prev_indices.push(i);
          }
        }

        // Get indices of articulated notes on current chord
        current_indices = [];
        for (let i = 0; i < positions.length; i++) {
          const n = positions[i];
          if (valid_strings.includes(n.str)) {
            current_indices.push(i);
          }
        }
      }

      if (stave.tab != null) {
        this.addTabArticulation(valid_articulation,
          prev_tab_note, current_tab_note, prev_indices, current_indices);
      }

      if (stave.note != null) {
        this.addStaveArticulation(valid_articulation,
          stave_notes[prev_index], _.last(stave_notes),
          prev_indices, current_indices);
      }
    }

    if (!has_bends) {
      this.closeBends(0);
    }
  }

  addRest(params: any): void {
    L("addRest: ", params);
    this.closeBends();

    if (params["position"] === 0) {
      this.addStaveNote({
        spec: ["r/4"],
        accidentals: [],
        is_rest: true
      });
    } else {
      const position = this.tuning.getNoteForFret((parseInt(params["position"], 10) + 5) * 2, 6);
      this.addStaveNote({
        spec: [position],
        accidentals: [],
        is_rest: true
      });
    }

    const tab_notes = _.last(this.staves).tab_notes;
    if (this.customizations["tab-stems"] === "true") {
      const position = params["position"] === 0 ? "r/4" : this.tuning.getNoteForFret((parseInt(params["position"], 10) + 5) * 2, 6);
      const tab_note = new Vex.Flow.StaveNote({
        keys: [position || "r/4"],
        duration: this.current_duration + "r",
        clef: "treble",
        auto_stem: false
      });
      if (this.current_duration[this.current_duration.length - 1] === "d") {
        Vex.Dot.buildAndAttach([tab_note], {index: 0});
      }
      tab_notes.push(tab_note);
    } else {
      tab_notes.push(new Vex.Flow.GhostNote(this.current_duration));
    }
  }

  addChord(chord: any[], chord_articulation?: any, chord_decorator?: any): void {
    if (_.isEmpty(chord)) return;
    L("addChord: ", chord);
    const stave = _.last(this.staves);

    const specs: any[][] = [];          // The stave note specs
    const play_notes: any[][] = [];     // Notes to be played by audio players
    const accidentals: any[][] = [];    // The stave accidentals
    const articulations: any[][] = [];  // Articulations (ties, bends, taps)
    const decorators: any[] = [];       // Decorators (vibratos, harmonics) - single value per position
    const tab_specs: any[][] = [];      // The tab notes
    const durations: any[] = [];        // The duration of each position
    let num_notes = 0;

    // Chords are complicated, because they can contain little
    // lines one each string. We need to keep track of the motion
    // of each line so we know which tick they belong in.
    let current_string = _.first(chord).string;
    let current_position = 0;

    for (const note of chord) {
      num_notes++;
      if (note.abc != null || note.string !== current_string) {
        current_position = 0;
        current_string = note.string;
      }

      if (specs[current_position] == null) {
        // New position. Create new element arrays for this
        // position.
        specs[current_position] = [];
        play_notes[current_position] = [];
        accidentals[current_position] = [];
        tab_specs[current_position] = [];
        articulations[current_position] = [];
        decorators[current_position] = null;
      }

      let new_note: string | null = null;
      let new_octave: any = null;
      let accidental: string | null = null;

      let play_note = null;

      if (note.abc != null) {
        const octave = note.octave != null ? note.octave : note.string;
        [new_note, new_octave, accidental] = this.getNoteForABC(note.abc, octave);
        let acc: string;
        if (accidental != null) {
          acc = accidental.split("_")[0];
        } else {
          acc = "";
        }

        play_note = `${new_note}${acc}`;
        if (note.fret == null) {
          note.fret = 'X';
        }
      } else if (note.fret != null) {
        [new_note, new_octave, accidental] = this.getNoteForFret(note.fret, note.string);
        play_note = this.tuning.getNoteForFret(note.fret, note.string).split("/")[0];
      } else {
        throw new Vex.RuntimeError("ArtistError", "No note specified");
      }

      const play_octave = parseInt(new_octave, 10) + this.current_octave_shift;

      const current_duration = note.time != null ? {time: note.time, dot: note.dot} : null;
      specs[current_position].push(`${new_note}/${new_octave}`);
      play_notes[current_position].push(`${play_note}/${play_octave}`);
      accidentals[current_position].push(accidental);
      tab_specs[current_position].push({fret: note.fret, str: note.string});
      if (note.articulation != null) {
        articulations[current_position].push(note.articulation);
      }
      durations[current_position] = current_duration;
      if (note.decorator != null) {
        decorators[current_position] = note.decorator;
      }

      current_position++;
    }

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const saved_duration = this.current_duration;
      if (durations[i] != null) {
        this.setDuration(durations[i].time, durations[i].dot);
      }
      this.addTabNote(tab_specs[i], play_notes[i]);
      if (stave.note != null) {
        this.addStaveNote({spec: spec, accidentals: accidentals[i], play_note: play_notes[i]});
      }
      if (articulations[i]) {
        this.addArticulations(articulations[i]);
      }
      if (decorators[i] != null) {
        this.addDecorator(decorators[i]);
      }
    }

    if (chord_articulation != null) {
      const art: any[] = [];
      for (let num = 1; num <= num_notes; num++) {
        art.push(chord_articulation);
      }
      this.addArticulations(art);
    }

    if (chord_decorator != null) {
      this.addDecorator(chord_decorator);
    }
  }

  addNote(note: any): void {
    this.addChord([note]);
  }

  addTextVoice(): void {
    _.last(this.staves).text_voices.push([]);
  }

  setTextFont(font: string | null): void {
    if (font != null) {
      const parts = font.match(/([^-]*)-([^-]*)-([^.]*)/);
      if (parts != null) {
        this.customizations["font-face"] = parts[1];
        this.customizations["font-size"] = parseInt(parts[2], 10);
        this.customizations["font-style"] = parts[3];
      }
    }
  }

  addTextNote(text: string, position: number = 0, justification: string = "center", smooth: boolean = true, ignore_ticks: boolean = false): void {
    const voices = _.last(this.staves).text_voices;
    if (_.isEmpty(voices)) {
      throw new Vex.RuntimeError("ArtistError", "Can't add text note without text voice");
    }

    const font_face = this.customizations["font-face"];
    const font_size = this.customizations["font-size"];
    const font_style = this.customizations["font-style"];

    let just: any;
    switch (justification) {
      case "center":
        just = Vex.Flow.TextNote.Justification.CENTER;
        break;
      case "left":
        just = Vex.Flow.TextNote.Justification.LEFT;
        break;
      case "right":
        just = Vex.Flow.TextNote.Justification.RIGHT;
        break;
      default:
        just = Vex.Flow.TextNote.Justification.CENTER;
    }

    const duration = ignore_ticks ? "b" : this.current_duration;

    const struct: any = {
      text: text,
      duration: duration,
      smooth: smooth,
      ignore_ticks: ignore_ticks,
      font: {
        family: font_face,
        size: font_size,
        weight: font_style
      }
    };

    if (text[0] === "#") {
      struct.glyph = text.slice(1);
    }

    const note = new Vex.Flow.TextNote(struct)
      .setLine(position).setJustification(just);

    (_.last(voices) as any).push(note);
  }

  addVoice(options?: any): void {
    this.closeBends();
    const stave = _.last(this.staves);
    if (stave == null) {
      return this.addStave(options);
    }

    if (!_.isEmpty(stave.tab_notes)) {
      stave.tab_voices.push(stave.tab_notes);
      stave.tab_notes = [];
    }

    if (!_.isEmpty(stave.note_notes)) {
      stave.note_voices.push(stave.note_notes);
      stave.note_notes = [];
    }
  }

  addStave(element?: string, options?: any): void {
    const opts: any = {
      tuning: "standard",
      clef: "treble",
      key: "C",
      notation: element === "tabstave" ? "false" : "true",
      tablature: element === "stave" ? "false" : "true",
      strings: 6
    };

    if (options && typeof options.strings === 'string') {
      options.strings = parseInt(options.strings, 10);
    }

    _.extend(opts, options);
    L("addStave: ", element, opts);

    let tab_stave = null;
    let note_stave = null;

    // This is used to line up tablature and notation.
    const start_x = this.x + this.customizations["connector-space"];
    let tabstave_start_x = 40;

    if (opts.notation === "true") {
      note_stave = new Vex.Flow.Stave(start_x, this.last_y, this.customizations.width - 20,
        {left_bar: false});
      if (opts.clef !== "none") {
        note_stave.addClef(opts.clef);
      }
      note_stave.addKeySignature(opts.key);
      if (opts.time != null) {
        note_stave.addTimeSignature(opts.time);
      }

      this.last_y += note_stave.getHeight() +
                 this.options.note_stave_lower_spacing +
                 parseInt(this.customizations["stave-distance"], 10);
      tabstave_start_x = note_stave.getNoteStartX();
      this.current_clef = opts.clef === "none" ? "treble" : opts.clef;
    }

    if (opts.tablature === "true") {
      tab_stave = new Vex.Flow.TabStave(start_x, this.last_y, this.customizations.width - 20,
        {left_bar: false}).setNumLines(opts.strings);
      if (opts.clef !== "none") {
        tab_stave.addTabGlyph();
      }
      tab_stave.setNoteStartX(tabstave_start_x);
      this.last_y += tab_stave.getHeight() + this.options.tab_stave_lower_spacing;
    }

    this.closeBends();
    const beam_groups = Vex.Flow.Beam.getDefaultBeamGroups(opts.time);
    this.staves.push({
      tab: tab_stave,
      note: note_stave,
      tab_voices: [],
      note_voices: [],
      tab_notes: [],
      note_notes: [],
      text_voices: [],
      beam_groups: beam_groups
    });

    this.tuning.setTuning(opts.tuning);
    this.key_manager.setKey(opts.key);

    return;
  }

  runCommand(line: string, _l: number = 0, _c: number = 0): void {
    L("runCommand: ", line);
    const words = line.split(/\s+/);
    switch (words[0]) {
      case "octave-shift":
        this.current_octave_shift = parseInt(words[1], 10);
        L("Octave shift: ", this.current_octave_shift);
        break;
      default:
        throw new Vex.RuntimeError("ArtistError", `Invalid command '${words[0]}' at line ${_l} column ${_c}`);
    }
  }
}

// Helper functions
const L = (...args: any[]) => {
  if (Artist.DEBUG && console != null) {
    console.log("(Vex.Flow.Artist)", ...args);
  }
};

const parseBool = (str: string): boolean => {
  return (str === "true");
};

const makeDuration = (time: string, dot: boolean): string => {
  return time + (dot ? "d" : "");
};

const makeBend = (from_fret: any, to_fret: any): any => {
  let direction = Vex.Flow.Bend.UP;
  let text = "";

  if (parseInt(from_fret, 10) > parseInt(to_fret, 10)) {
    direction = Vex.Flow.Bend.DOWN;
  } else {
    const diff = Math.abs(to_fret - from_fret);
    switch (diff) {
      case 1:
        text = "1/2";
        break;
      case 2:
        text = "Full";
        break;
      case 3:
        text = "1 1/2";
        break;
      default:
        text = `Bend to ${to_fret}`;
    }
  }

  return {type: direction, text: text};
};

const getFingering = (text: string): RegExpMatchArray | null => {
  return text.match(/^\.fingering\/([^.]+)\./);
};

const getStrokeParts = (text: string): RegExpMatchArray | null => {
  return text.match(/^\.stroke\/([^.]+)\./);
};

const getScoreArticulationParts = (text: string): RegExpMatchArray | null => {
  return text.match(/^\.(a[^\/]*)\/(t|b)[^.]*\./);
};

const formatAndRender = (ctx: any, tab: any, score: any, text_notes: any[], customizations: any, options: any): any => {
  const tab_stave = tab != null ? tab.stave : null;
  const score_stave = score != null ? score.stave : null;

  const tab_voices: any[] = [];
  const score_voices: any[] = [];
  const text_voices: any[] = [];
  let beams: any[] = [];
  let format_stave = null;
  let text_stave = null;

  const beam_config: any = {
    beam_rests: parseBool(customizations["beam-rests"]),
    show_stemlets: parseBool(customizations["beam-stemlets"]),
    beam_middle_only: parseBool(customizations["beam-middle-only"]),
    groups: options.beam_groups
  };

  if (tab != null) {
    const multi_voice = (tab.voices.length > 1) ? true : false;
    for (let i = 0; i < tab.voices.length; i++) {
      const notes = tab.voices[i];
      if (_.isEmpty(notes)) continue;
      _.each(notes, (note: any) => note.setStave(tab_stave));
      const voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4)
        .setMode(Vex.Flow.Voice.Mode.SOFT);
      voice.addTickables(notes);
      tab_voices.push(voice);

      if (customizations["tab-stems"] === "true") {
        if (multi_voice) {
          beam_config.stem_direction = i === 0 ? 1 : -1;
        } else {
          beam_config.stem_direction = customizations["tab-stem-direction"] === "down" ? -1 : 1;
        }

        beam_config.beam_rests = false;
        beams = beams.concat(Vex.Flow.Beam.generateBeams(voice.getTickables() as any, beam_config));
      }
    }

    format_stave = tab_stave;
    text_stave = tab_stave;
  }

  beam_config.beam_rests = parseBool(customizations["beam-rests"]);

  if (score != null) {
    const multi_voice = (score.voices.length > 1) ? true : false;
    for (let i = 0; i < score.voices.length; i++) {
      const notes = score.voices[i];
      if (_.isEmpty(notes)) continue;
      const stem_direction = i === 0 ? 1 : -1;
      _.each(notes, (note: any) => note.setStave(score_stave));

      const voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4)
        .setMode(Vex.Flow.Voice.Mode.SOFT);
      voice.addTickables(notes);
      score_voices.push(voice);
      if (multi_voice) {
        beam_config.stem_direction = stem_direction;
        beams = beams.concat(Vex.Flow.Beam.generateBeams(notes, beam_config));
      } else {
        beam_config.stem_direction = null;
        beams = beams.concat(Vex.Flow.Beam.generateBeams(notes, beam_config));
      }
    }

    format_stave = score_stave;
    text_stave = score_stave;
  }

  for (const notes of text_notes) {
    if (_.isEmpty(notes)) continue;
    _.each(notes, (voice: any) => voice.setStave(text_stave));
    const voice = new Vex.Flow.Voice(Vex.Flow.TIME4_4)
        .setMode(Vex.Flow.Voice.Mode.SOFT);
    voice.addTickables(notes);
    text_voices.push(voice);
  }

  if (format_stave != null) {
    let format_voices: any[] = [];
    const formatter = new Vex.Flow.Formatter();
    let align_rests = false;

    if (tab != null) {
      if (!_.isEmpty(tab_voices)) {
        formatter.joinVoices(tab_voices);
      }
      format_voices = tab_voices;
    }

    if (score != null) {
      if (!_.isEmpty(score_voices)) {
        formatter.joinVoices(score_voices);
      }
      format_voices = format_voices.concat(score_voices);
      if (score_voices.length > 1) {
        align_rests = true;
      }
    }

    if (!_.isEmpty(text_notes) && !_.isEmpty(text_voices)) {
      formatter.joinVoices(text_voices);
      format_voices = format_voices.concat(text_voices);
    }

    if (!_.isEmpty(format_voices)) {
      formatter.formatToStave(format_voices, format_stave, {align_rests: align_rests});
    }

    if (tab != null) {
      _.each(tab_voices, (voice: any) => voice.draw(ctx, tab_stave));
    }
    if (score != null) {
      _.each(score_voices, (voice: any) => voice.draw(ctx, score_stave));
    }
    _.each(beams, (beam: any) => beam.setContext(ctx).draw());
    if (!_.isEmpty(text_notes)) {
      _.each(text_voices, (voice: any) => voice.draw(ctx, text_stave));
    }

    if (tab != null && score != null) {
      (new Vex.Flow.StaveConnector(score.stave, tab.stave))
        .setType(Vex.Flow.StaveConnector.type.BRACKET)
        .setContext(ctx).draw();
    }

    return score != null ? score_voices : tab_voices;
  }
};

export default Artist;
