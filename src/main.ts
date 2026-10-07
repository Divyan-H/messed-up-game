import '@fontsource/press-start-2p/latin-400.css';
import './style.css';
import { sfx } from './audio/sfx';
import { App } from './ui/app';
import { h } from './ui/dom';

const shell = document.getElementById('app')!;
const screen = document.getElementById('screen')!;
const btns = document.getElementById('tb-btns')!;

const app = new App(screen, shell);
void app.account.load(); // the title screen re-draws when the account status arrives

// title-bar toggles (retro "window buttons")
const mk = (label: string, key: 'sound' | 'crt') => {
  const b = h('button', { class: 'tb-btn', type: 'button', title: key }, label);
  b.onclick = () => {
    app.toggleSetting(key);
    if (key === 'sound') sfx.click();
    paint();
  };
  const paint = () => b.classList.toggle('off', !app.profile.get().settings[key]);
  paint();
  return b;
};
btns.append(mk('SND', 'sound'), mk('CRT', 'crt'));

// make sure the pixel font is ready before first canvas text
void document.fonts?.load('8px "Press Start 2P"').finally(() => app.goTitle());
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
