// Browser environment stub so the real game script can run head-less under jsc.
// The 2D context deliberately throws on a negative radius, exactly like a real
// canvas — that's how the "narrow pancake" freeze regression gets caught.

var FRAME_ERRORS = [];   // the game's rAF loop try/catch reports here via console.error
var DRAW_CALLS = 0;
var PENDING = null;      // last requestAnimationFrame callback (driven manually by the tests)

var console = {
  error: function(){ FRAME_ERRORS.push(Array.prototype.slice.call(arguments).join(' ')); },
  log: function(){}, warn: function(){}
};

function setTimeout(){ return 0; }                 // ignore deferred overlay reveal
function setInterval(){ return 0; }                // music scheduler (never armed head-less)
function clearInterval(){}
function requestAnimationFrame(cb){ PENDING = cb; return 1; }

function makeCtx(){
  function gradient(){ return { addColorStop: function(){} }; }
  return {
    setTransform: function(){}, save: function(){}, restore: function(){},
    translate: function(){}, rotate: function(){}, scale: function(){},
    beginPath: function(){}, moveTo: function(){}, closePath: function(){},
    lineTo: function(){}, rect: function(){}, setLineDash: function(){},
    quadraticCurveTo: function(){}, bezierCurveTo: function(){},
    fill: function(){ DRAW_CALLS++; }, stroke: function(){ DRAW_CALLS++; },
    fillRect: function(){}, strokeText: function(){}, fillText: function(){},
    createLinearGradient: gradient, createRadialGradient: gradient,
    arcTo: function(x1,y1,x2,y2,r){ if (r < 0) throw new Error('IndexSizeError: arcTo radius ' + r); },
    arc:   function(x,y,r){ if (r < 0) throw new Error('IndexSizeError: arc radius ' + r); },
    ellipse: function(x,y,rx,ry){ if (rx < 0 || ry < 0) throw new Error('IndexSizeError: ellipse radius ' + rx + '/' + ry); },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', globalAlpha: 1
  };
}

var CTX = makeCtx();

function makeEl(id){
  var el = {
    id: id, textContent: '', value: '', innerHTML: '', disabled: false,
    style: {}, _h: {}, _cls: {},
    addEventListener: function(t, fn){ this._h[t] = fn; },
    focus: function(){}, blur: function(){},
    getContext: function(){ return CTX; },
    getBoundingClientRect: function(){ return { width: 400, height: 800, left: 0, top: 0 }; }
  };
  el.classList = {
    add:      function(c){ el._cls[c] = true; },
    remove:   function(c){ delete el._cls[c]; },
    contains: function(c){ return !!el._cls[c]; }
  };
  return el;
}

var ELS = {};
['game','app','score','best','startOverlay','overOverlay','finalScore','newBest',
 'overTitle','overEmoji','hint','muteBtn','playBtn','retryBtn',
 'lbBox','lbEntry','lbName','lbSave','lbList','lbStatus'].forEach(function(id){
  ELS[id] = makeEl(id);
});
ELS.overOverlay._cls.hidden = true;   // matches the initial HTML classes

var document = {
  _h: {}, visibilityState: 'visible',
  getElementById: function(id){ if (!ELS[id]) { ELS[id] = makeEl(id); } return ELS[id]; },
  addEventListener: function(t, fn){ this._h[t] = fn; }
};
var window = {
  _h: {}, devicePixelRatio: 2, console: console,
  __PANCAKE_TEST__: {},                 // <- flips each game's test seam on
  __SIZZLE_TEST__: {},
  addEventListener: function(t, fn){ this._h[t] = fn; }
  // no AudioContext -> audio stays disabled during tests
};
var navigator = {};                     // no vibrate

var _store = {};
var localStorage = {
  getItem: function(k){ return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
  setItem: function(k, v){ _store[k] = String(v); }
};
