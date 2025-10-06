// Vex.Flow.VexTab
// Copyright 2012 Mohit Cheppudira <mohit@muthanna.com>
//
// This class implements the semantic analysis of the Jison
// output, and generates elements that can be used by
// Vex.Flow.Artist to render the notation.
// parsed by Vex.Flow.VexTab.

import * as Vex from '@aurokk/vexflow';
import _ from 'lodash';
// @ts-ignore - jison parser module
import * as parser from './vextab.jison';
import Artist from './artist';

interface StaveOption {
  key: string;
  value: string;
  _l?: number;
  _c?: number;
}

interface Element {
  element?: string;
  command?: string;
  type?: string;
  params?: any;
  chord?: any[];
  time?: string;
  dot?: boolean;
  abc?: any;
  fret?: string;
  articulation?: string;
  decorator?: string;
  options?: StaveOption[];
  notes?: any[];
  text?: any[];
  _l?: number;
  _c?: number;
}

class VexTab {
  static DEBUG = false;
  private artist: Artist;
  private valid: boolean = false;
  private elements: any = false;

  private static L(...args: any[]): void {
    if (VexTab.DEBUG && console?.log) {
      console.log("(Vex.Flow.VexTab)", ...args);
    }
  }

  private static newError(object: any, msg: string): Error {
    return new Vex.RuntimeError("ParseError",
      `${msg} in line ${object._l} column ${object._c}`);
  }

  constructor(artist: Artist) {
    this.artist = artist;
    this.reset();
  }

  reset(): void {
    this.valid = false;
    this.elements = false;
  }

  isValid(): boolean {
    return this.valid;
  }

  getArtist(): Artist {
    return this.artist;
  }

  parseStaveOptions(options?: StaveOption[]): any {
    const params: any = {};
    if (!options) return params;

    let notation_option: StaveOption | null = null;
    for (const option of options) {
      const error = (msg: string) => VexTab.newError(option, msg);
      params[option.key] = option.value;

      switch (option.key) {
        case "notation":
        case "tablature":
          notation_option = option;
          if (option.value !== "true" && option.value !== "false") {
            throw error(`'${option.key}' must be 'true' or 'false'`);
          }
          break;
        case "key":
          if (!Vex.Flow.hasKeySignature(option.value)) {
            throw error(`Invalid key signature '${option.value}'`);
          }
          break;
        case "clef":
          const clefs = ["treble", "bass", "tenor", "alto", "percussion", "none"];
          if (!clefs.includes(option.value)) {
            throw error(`'clef' must be one of ${clefs.join(', ')}`);
          }
          break;
        case "voice":
          const voices = ["top", "bottom", "new"];
          if (!voices.includes(option.value)) {
            throw error(`'voice' must be one of ${voices.join(', ')}`);
          }
          break;
        case "time":
          try {
            new Vex.Flow.TimeSignature(option.value);
          } catch (e) {
            throw error(`Invalid time signature: '${option.value}'`);
          }
          break;
        case "tuning":
          try {
            new Vex.Flow.Tuning(option.value);
          } catch (e) {
            throw error(`Invalid tuning: '${option.value}'`);
          }
          break;
        case "strings":
          const num_strings = parseInt(option.value);
          if (num_strings < 4 || num_strings > 8) {
            throw error(`Invalid number of strings: ${num_strings}`);
          }
          break;
        default:
          throw error(`Invalid option '${option.key}'`);
      }
    }

    if (params.notation === "false" && params.tablature === "false") {
      throw VexTab.newError(notation_option, "Both 'notation' and 'tablature' can't be invisible");
    }

    return params;
  }

  parseCommand(element: Element): void {
    if (element.command === "bar") {
      this.artist.addBar(element.type);
    }

    if (element.command === "tuplet") {
      this.artist.makeTuplets(element.params.tuplet, element.params.notes);
    }

    if (element.command === "annotations") {
      this.artist.addAnnotations(element.params);
    }

    if (element.command === "rest") {
      this.artist.addRest(element.params);
    }

    if (element.command === "command") {
      this.artist.runCommand(element.params, element._l, element._c);
    }
  }

  parseChord(element: Element): void {
    VexTab.L("parseChord:", element);
    this.artist.addChord(
      _.map(element.chord, (note) =>
        _.pick(note, 'time', 'dot', 'fret', 'abc', 'octave', 'string', 'articulation', 'decorator')),
      element.articulation,
      element.decorator
    );
  }

  parseFret(note: any): void {
    this.artist.addNote(_.pick(
      note, 'time', 'dot', 'fret', 'string', 'articulation', 'decorator'));
  }

  parseABC(note: any): void {
    this.artist.addNote(_.pick(
      note, 'time', 'dot', 'fret', 'abc', 'octave', 'string', 'articulation', 'decorator'));
  }

  parseStaveElements(notes: Element[]): void {
    VexTab.L("parseStaveElements:", notes);
    for (const element of notes) {
      if (element.time) {
        this.artist.setDuration(element.time, element.dot);
      }

      if (element.command) {
        this.parseCommand(element);
      }

      if (element.chord) {
        this.parseChord(element);
      }

      if (element.abc) {
        this.parseABC(element);
      } else if (element.fret) {
        this.parseFret(element);
      }
    }
  }

  parseStaveText(text_line: any[]): void {
    if (!_.isEmpty(text_line)) {
      this.artist.addTextVoice();
    }

    let position = 0;
    let justification = "center";
    let smooth = true;
    let font: string | null = null;

    const bartext = () => this.artist.addTextNote("", 0, justification, false, true);
    const createNote = (text: string) => {
      let ignore_ticks = false;
      if (text[0] === "|") {
        ignore_ticks = true;
        text = text.slice(1);
      }

      try {
        this.artist.addTextNote(text, position, justification, smooth, ignore_ticks);
      } catch (e) {
        throw new Error("Bad text or duration. Did you forget a comma?" + e);
      }
    };

    for (const str of text_line) {
      const text = str.text.trim();
      if (text.match(/\.font=.*/)) {
        font = text.slice(6);
        this.artist.setTextFont(font);
      } else if (text[0] === ":") {
        this.artist.setDuration(text);
      } else if (text[0] === ".") {
        const command = text.slice(1);
        switch (command) {
          case "center":
          case "left":
          case "right":
            justification = command;
            break;
          case "strict":
            smooth = false;
            break;
          case "smooth":
            smooth = true;
            break;
          case "bar":
          case "|":
            bartext();
            break;
          default:
            position = parseInt(text.slice(1), 10);
        }
      } else if (text === "|") {
        bartext();
      } else if (text.slice(0, 2) === "++") {
        this.artist.addTextVoice();
      } else {
        createNote(text);
      }
    }
  }

  generate(): void {
    for (const stave of this.elements) {
      switch (stave.element) {
        case "stave":
        case "tabstave":
          this.artist.addStave(stave.element, this.parseStaveOptions(stave.options));
          if (stave.notes) {
            this.parseStaveElements(stave.notes);
          }
          if (stave.text) {
            this.parseStaveText(stave.text);
          }
          break;
        case "voice":
          this.artist.addVoice(this.parseStaveOptions(stave.options));
          if (stave.notes) {
            this.parseStaveElements(stave.notes);
          }
          if (stave.text) {
            this.parseStaveText(stave.text);
          }
          break;
        case "options":
          const options: any = {};
          for (const option of stave.params) {
            options[option.key] = option.value;
          }
          try {
            this.artist.setOptions(options);
          } catch (e: any) {
            throw VexTab.newError(stave, e.message);
          }
          break;
        default:
          throw VexTab.newError(stave, `Invalid keyword '${stave.element}'`);
      }
    }
  }

  parse(code: string): any {
    (parser as any).parseError = (message: string, hash: any) => {
      VexTab.L("VexTab parse error: ", message, hash);
      const msg = `Unexpected text '${hash.text}' at line ${hash.loc.first_line} column ${hash.loc.first_column}.`;
      throw new Vex.RuntimeError("ParseError", msg);
    };

    if (!code) {
      throw new Vex.RuntimeError("ParseError", "No code");
    }

    VexTab.L("Parsing:\n" + code);

    // Strip lines
    const stripped_code = code.split(/\r\n|\r|\n/).map(line => line.trim());
    this.elements = (parser as any).parse(stripped_code.join("\n"));
    if (this.elements) {
      this.generate();
      this.valid = true;
    }

    return this.elements;
  }
}

export default VexTab;
