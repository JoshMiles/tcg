// The start-up window: shows the step main.js sends (text only). It can only listen; it sends nothing back.
const $ = id => document.getElementById(id);
window.splash.onStep(step => {
  $('line').textContent = step.text;
  $('bar').hidden = step.progress === null;
  $('fill').style.width = `${step.progress === null ? 0 : step.progress}%`;
  $('version').textContent = step.version ? `Version ${step.version}` : '';
});
