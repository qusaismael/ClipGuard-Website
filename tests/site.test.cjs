const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');

function copyFixture() {
  const blocks = [...html.matchAll(/<div class="download-card">[\s\S]*?<code>([\s\S]*?)<\/code>[\s\S]*?<button class="copy-btn"([^>]*)>Copy<\/button>/g)];
  assert.equal(blocks.length, 3, 'three installation examples must be present');
  const copied = [];
  const buttons = blocks.map(([, visible, attrs]) => {
    const listeners = {};
    return {
      textContent: 'Copy',
      classList: { add() {}, remove() {} },
      getAttribute(name) {
        assert.equal(name, 'data-code');
        const match = attrs.match(/data-code="([^"]*)"/);
        return match ? match[1].replace(/&#10;/g, '\n') : null;
      },
      closest(selector) {
        assert.equal(selector, '.code-block');
        return { querySelector(tag) { assert.equal(tag, 'code'); return { textContent: visible }; } };
      },
      addEventListener(name, callback) { listeners[name] = callback; },
      click() { return listeners.click.call(this); }
    };
  });
  const copySection = script.split('// Copy Code Buttons')[1]?.split('// Smooth Scroll Enhancement')[0];
  assert.ok(copySection, 'copy handler section must exist');
  vm.runInNewContext(copySection, {
    document: { querySelectorAll: () => buttons },
    navigator: { clipboard: { async writeText(text) { copied.push(text); } } },
    setTimeout: () => {},
    console
  });
  return { blocks, buttons, copied };
}

test('copy buttons have one source of truth for the command', () => {
  assert.doesNotMatch(html, /data-code=/);
});

test('mobile menu has button semantics and a visible keyboard target', () => {
  assert.match(html, /<ul class="nav-links" id="primary-nav">/);
  assert.match(html, /<button type="button" class="hamburger" aria-label="Menu" aria-expanded="false" aria-controls="primary-nav">/);
  assert.match(html, /<\/button>\s*<\/div>\s*<\/nav>/);
  const css = fs.readFileSync(path.join(__dirname, '../css/styles.css'), 'utf8');
  assert.match(css, /\.hamburger:focus-visible\s*\{[^}]*outline:\s*3px solid currentColor/s);
  assert.match(css, /\.hamburger\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
});

test('mobile navigation toggles aria-expanded and Escape restores focus', () => {
  function element() {
    const classes = new Set();
    const attrs = new Map([['aria-expanded', 'false']]);
    const listeners = {};
    return {
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        toggle(name) { if (classes.has(name)) { classes.delete(name); return false; } classes.add(name); return true; },
        contains(name) { return classes.has(name); }
      },
      addEventListener(type, fn) { listeners[type] = fn; },
      dispatch(type, event = {}) { listeners[type](event); },
      setAttribute(name, value) { attrs.set(name, String(value)); },
      getAttribute(name) { return attrs.get(name); },
      focus() { this.focused = true; },
      focused: false
    };
  }
  const menu = element();
  const nav = element();
  const link = element();
  const doc = { addEventListener(type, fn) { this.events[type] = fn; }, events: {},
    querySelector(selector) { return selector === '.hamburger' ? menu : nav; },
    querySelectorAll() { return [link]; } };
  const mobileScript = script.split('// Mobile Navigation Toggle')[1]?.split('// Copy Code Buttons')[0];
  assert.ok(mobileScript, 'mobile navigation handler exists');
  vm.runInNewContext(mobileScript, { document: doc });
  menu.dispatch('click');
  assert.equal(nav.classList.contains('active'), true);
  assert.equal(menu.getAttribute('aria-expanded'), 'true');
  doc.events.keydown({ key: 'Escape' });
  assert.equal(nav.classList.contains('active'), false);
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  assert.equal(menu.focused, true);
  menu.dispatch('click');
  link.dispatch('click');
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
});

test('copy matches visible command on every platform', async () => {
  const { blocks, buttons, copied } = copyFixture();
  for (let i = 0; i < blocks.length; i++) {
    await buttons[i].click();
    assert.equal(copied[i], blocks[i][1].trim(), `card ${i} copied exactly the shown command`);
  }
});
