// Load VexTab module.
import * as _ from 'lodash';
import { VexTab, Artist, Vex } from '../src/main';

declare const $: any;

$(() => {
  Artist.DEBUG = true;
  VexTab.DEBUG = false;

  // Create VexFlow Renderer from canvas element with id #boo
  const Renderer = Vex.Flow.Renderer;
  const renderer = new Renderer($('#boo')[0], Renderer.Backends.SVG);

  // Initialize VexTab artist and parser.
  const artist = new Artist(10, 10, 700, { scale: 0.8 });
  const tab = new VexTab(artist);

  function render(): void {
    try {
      tab.reset();
      artist.reset();
      tab.parse($('#blah').val());
      artist.render(renderer);
      $('#error').text('');
    } catch (e: any) {
      console.error(e);
      $('#error').html(e.message.replace(/[\n]/g, '<br/>'));
    }
  }

  $('#blah').keyup(_.throttle(render, 250));
  render();
});
