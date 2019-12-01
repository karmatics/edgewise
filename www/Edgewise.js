var Edgewise = {
  elements: {}, // all the important DOM elements
  timesArray: [], // array of integers (in seconds)
  currentTimeChunk: null, // integer index into timesArray
  timelineElements: null, // one per item in timesArray
  timerHandle: null, // setTimeout handle

  whichPerson: 1,
  people: [], // array of people, with members "name" and "color"
  colors: ['#5f5', '#58f', '#f50', '#f0f'],

  tickSound: null,
  expiredSound: null,

  //call this to start it.  pass it a container element,
  // two sounds (optional), a host url (optional, for syncing),
  init: function(container, tickSound, expiredSound, host) {
    var self = this;

    // unfinished sync stuff
    var session = new URL(window.location.href).searchParams.get('session');


    // todo: break this out to a function, it
    // has gotten pretty long
    if(session) {
      this.session = session;

      // set up global callback function for syncing

      window.syncWithPrimary = function(data) {
        if(data.error) {
          alert('synchronization session id not found')
          return;
        }
        var people = data.names.split(',')
        for(var i=0;i<self.inputElems.people.length; i++) {
          self.inputElems.people[i].setValue(people[i] || '');
        }
        self.inputElems.times.setValue(data.times);
        self.inputValuesChanged();

        // todo: calculate these from current time, elapsed, etc
        // Edgewise.currentTimeChunk = 2;
        // Edgewise.secondsLeft = 22;
        Edgewise.update();
      };
      // add a script tag to the document to retrieve this js 'file'
      // (actually dynamically generated, "jsonP"
      var scriptTag = document.createElement('script');
      scriptTag.src = host + 'syncReplicaWithPrimary.js?id=' + this.session +
          '&cachebust=' + Math.random();
      document.body.appendChild(scriptTag);
    }

    // sounds to play when events happen. If null, it will be quiet
    this.tickSound = tickSound;
    this.expiredSound = expiredSound;

    // ElementTools is a micro-library that just is included at
    // the bottom of this file.
    var et = ElementTools;

    // make the timer text (the name and time remaining) and
    // the graphical timeline timeline
    this.elements.timerText = et.makeElement('div', {
        className: 'timerText'
      }, container);

    this.elements.timeline = et.makeElement('div', {
        className: 'timeline'
      }, container);

    this.elements.controls = et.makeElement('div', {
        className: 'controls'
      }, container);

    // they all share the same callback, which makes things slightly simpler
    var textCb = function() {
      self.inputValuesChanged();
    };

    // create all the elements (text elements, labels, etc) where you can
    // type in names as well as times, etc.  Save them in inputElems
    // (these are objects that have methods getValue(), setValue(),
    // setColor(), and setAfterText()
    this.inputElems = {
      people: [
        et.makeTextInputElem('person 1', 'Jane', this.elements.controls, textCb),
        et.makeTextInputElem('person 2', 'John', this.elements.controls,  textCb),
        et.makeTextInputElem('person 3', '', this.elements.controls, textCb),
        et.makeTextInputElem('person 4', '', this.elements.controls, textCb)
      ],
      times: et.makeTextInputElem('times', '1,3,6,10,10,6,3,1', this.elements.controls, textCb),
      speed: et.makeTextInputElem('speed', '100%', this.elements.controls, textCb)
    };
    for(var i=0; i<this.inputElems.people.length; i++) {
      this.inputElems.people[i].setColor(this.colors[i]);
    }

    // make the the buttons and their container
    var buttonHolder = et.makeElement('div', {
        className: 'btnHolder'
      }, this.elements.controls);

    this.elements.startOver = et.makeElement('input', {
        type: 'button',
        className: 'btn',
        value: 'start over',
        disabled: true,
        onclick: function() {
          self.buildTimeline();
          self.update();
          self.elements.startOver.disabled = true;
        }
      }, buttonHolder);

    this.elements.playPause = et.makeElement('input', {
        type: 'button',
        className: 'btn',
        value: 'play',
        onclick: function() {
          if(self.timerHandle) {
            clearTimeout(self.timerHandle);
            self.timerHandle = null;
            self.elements.playPause.value = 'play';
          } else {
            var timerFunction = function() {
              self.update();
              self.timerHandle = setTimeout(timerFunction, self.timerDelay);
            };
            timerFunction();
            self.elements.playPause.value = 'pause';
            self.elements.startOver.disabled = false;
          }
        }
      }, buttonHolder);

    // now we are ready to build the actual timeline and
    // such for the first time
    this.inputValuesChanged();
    this.buildTimeline();
    this.update();


    // if we aren't a replica, make a box for making a syncSession
    // todo: handle case of their being no sync server
    if(!this.session) {
      this.elements.primaryControls = et.makeElement('div', {
          className: 'controls'
        }, container);

      var buttonHolder = et.makeElement('div', {
          className: 'btnHolder'
        }, this.elements.primaryControls);

      this.elements.shareButton = et.makeElement('input', {
          type: 'button',
          className: 'btn bigBtn',
          value: 'share with replicas',
          onclick: function() {

            // todo: break this out to a function, it
            // has gotten pretty long

            // set up global callback function for syncing
            window.setSyncSessionId = function(id) {
              self.elementShareUrlContainer.innerHTML = '';
              et.makeElement('input', {
                  className: 'inputUrl',
                  value: window.location.href + '?session=' + id,
                  type: 'text'
                }, self.elementShareUrlContainer);
            };
            var scriptTag = document.createElement('script');

            var data = {
                currentTime: 45, // todo
                times: self.inputElems.times.getValue(),
                names: self.people.map(function(item){
                    return item.name; // check for commas?
                  }).join(','),
                isPlaying: (self.timerHandle)?'true':'false'
              };

              var params = [];
              for(var i in data) {
                params.push(i + '=' + data[i]);
              }

            // todo: get url from somewhere (html file?)
            scriptTag.src = host + 'createOrUpdateSyncSession.js?' +
                params.join('&') +
                '&cachebust=' + Math.random();
            document.body.appendChild(scriptTag);
            }
        }, buttonHolder);

      this.elementShareUrlContainer = et.makeElement('div', {
        }, this.elements.primaryControls);
    }
    window.onresize = function(){
       self.buildTimeline();
    };
  },

  // this just adjusts the yellow border to make the proper timeline
  // chunk shown as current
  updateSelectedChunk: function() {
    for(var i=0; i<this.timesArray.length; i++) {
        this.timelineElems[i].className =
          (i==this.currentTimeChunk) ? 'timelineChunkSel' : 'timelineChunk'
    }
  },

  // Build the whole timeline. Done when starting, as well as when
  // the names change.
  buildTimeline: function() {
    if(this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
      this.elements.playPause.value = 'play';
      this.elements.startOver.disabled = 'true';
    }

    if(this.elements.pointer) {
      this.elements.pointer.parentNode.removeChild(this.elements.pointer)
      this.elements.pointer = null;
    }

    this.elements.timerText.innerHTML = '';
    this.elements.timeline.innerHTML = '';
    this.currentTimeChunk = -1;
    this.whichPerson = 0;
    this.secondsLeft = -1;
    this.timelineElems = [];

    var width = this.elements.timeline.offsetWidth;

    for(var i=0; i<this.timesArray.length; i++) {
      this.timelineElems[i] = ElementTools.makeElement('div', {
          style: {
              backgroundColor: this.people[i%this.people.length].color,
              // todo: fix the hardcoded width
              width: (Math.round(((this.timesArray[i] *
                     (width - 5 * this.timesArray.length)) /
                     this.totalTime))) + 'px'
            },
          className: 'timelineChunk',
          innerHTML: this.secondsToTimeString(this.timesArray[i]*60, true)
        },
        this.elements.timeline);
    }
  },

  // Put the pointer to the right place (creating it if needed)
  // Note that the css has it take one second to actually get there,
  // so it moves smoothly.
  movePointerElem: function() {
    var e = this.timelineElems[this.currentTimeChunk];
    var xPos = e.offsetLeft;
    var sec = this.timesArray[this.currentTimeChunk] * 60;
    var secsIn = sec - this.secondsLeft;
    var pixelsIn = (secsIn / sec) * (e.offsetWidth-2);
    var tx = 'translateX(' + (xPos + pixelsIn-1) + 'px)';

    if(!this.elements.pointer) {
      this.elements.pointer = ElementTools.makeElement('div', {
        className: 'timelinePointer',
        style: {
          transform:  tx
        }
      }, this.elements.timeline);
    } else {
      this.elements.pointer.style.transform = tx;
    }
  },

  // called every second while it is 'playing'. Updates timeline and
  // the timer text
  update: function() {
    var self = this;
    if(this.secondsLeft <= 0) {
      this.currentTimeChunk++;
      if(this.secondsLeft == 0) {
        if(this.expiredSound) {
          this.expiredSound.play();
        }
      }
      // at end?
      if(this.currentTimeChunk >= this.timesArray.length) {
        if(this.elements.pointer) {
          this.elements.pointer.parentNode.removeChild(this.elements.pointer)
          this.elements.pointer = null;
        }
        return;
      }
      this.secondsLeft = this.timesArray[this.currentTimeChunk]*60;
      this.whichPerson = (this.currentTimeChunk) % this.people.length;
      this.updateSelectedChunk();
    } else {
      this.secondsLeft -= 1;
      if(this.secondsLeft <= 10)
        if(this.tickSound) {
          this.tickSound.play();
        }
    }
    this.movePointerElem();

    // we use makeElement here, which will actually just use an
    // existing element
    ElementTools.makeElement(this.elements.timerText, {
      innerHTML: this.people[this.whichPerson].name + ': ' +
           this.secondsToTimeString(this.secondsLeft),
      style: {
          color:this.people[this.whichPerson].color
        }
      });
  },

  // called whenever the input values change (per keypress basis)
  inputValuesChanged: function(){
    var peopleLengthChanged = false;
    var timesChanged = false;

    var people = [];
    var ie = this.inputElems;

    for(var i=0; i<ie.people.length; i++) {
      var n = ie.people[i].getValue();
      ie.people[i].setAfterText('');
      if(n.length) {
        people.push({
          name: n,
          total: 0,
          color: this.colors[i],
          uiIndex: i
        });
      }
    }
    if(this.people.length != people.length) {
      peopleLengthChanged = true;
    }
    this.people = people;

    var ta = ie.times.getValue().split(',');
    for(var i=0; i<ta.length; i++) {
      var t = parseFloat(ta[i]);
      if(!t || isNaN(t)) {
        t = 0;
      }
      ta[i] = t;
      var which = i % people.length;
      people[which].total = t + (people[which].total || 0);
    }

    this.timesArray = ta;
    this.totalTime = 0;
    for(var i=0; i<people.length; i++) {
      var p = people[i];
      this.totalTime += p.total;
      ie.people[p.uiIndex].setAfterText(this.secondsToTimeString(p.total*60));
    }
    if(!this.isArraySame(ta, this.timesArray) || peopleLengthChanged) {
      this.buildTimeline();
    }
    this.timerDelay = (1/(parseFloat(ie.speed.getValue())/100)) *1000;
    this.update();
  },

  // build string to show time in minutes and seconds
  secondsToTimeString: function(secs, compact) {
    var divMin = secs % (60 * 60);
    var minutes = Math.floor(divMin / 60);
    var divSec = divMin % 60;
    var seconds = Math.round(divSec);
    if(!seconds  && compact) {
      seconds = '';
    } else {
      if(seconds < 10) {
        seconds = '0' + seconds;
      }
      seconds = ':' + seconds;
    }
    return minutes + seconds;
  },

  // simple comparison of two arrays
  isArraySame: function(a1, a2) {
    if(a1.length != a2.length) {
      return false;
    }
    for(var i=0; i<a1.length; i++) {
      if(a1[i] != a2[i]) {
        return false;
      }
    }
    return true;
  }
};

// Some handy things to make dom elements as needed by Edgewise.
// Not intended to be overly generalized, but just enough to
// keep the code cleanish and smallish.
var ElementTools = {

  // easy way to create an element and assign it properties
  // and styles in one step.
  // you can pass it a type ('div') or an existing element
  makeElement: function(element, options, parentElem) {
    if(typeof element == 'string') {
      element = document.createElement(element);
    }
    for(var i in options) {
      var item = options[i];
      if(typeof(item) == 'object') {
        for(var j in item) {
          element[i][j] = item[j];
        }
      } else {
        element[i] = item;
      }
    }
    if(parentElem) {
      parentElem.appendChild(element);
    }
    return element;
  },

  // make a label and input element, which automatically
  // stores in localstorage (with every keypress)
  // also calls callback on keypress
  makeTextInputElem: function (name, defaultValue, parent, cb) {
    // remove spaces for member name and localstorage name
    var self = this;
    var memberName = name.split(' ').join('');
    var value = localStorage.getItem('et_' + memberName) || defaultValue;

    // the object will have 4 externally called methods
    // (note: we didn't bother with prototype based classes
    // here, this works fine for our purposes)
    var obj = {
      getValue: function() {
        return this.input.value;
      },
      setValue: function(v) {
        this.input.value = v;
        localStorage.setItem('et_' + memberName, v);
        return this;
      },
      // the color of the label, used for showing what color
      // a person will appear as in the timer text and timeline.
      setColor: function(c) {
        this.outer.style.color = c;
        return this;
      },
      // "afterText" is the text to the right of the input element
      // we use it to show the total time a user has.
      // If not specified, it is not there.
      setAfterText: function(t) {
        this.afterText = self.makeElement(this.afterText || 'span', {
          innerHTML: t
        }, this.outer);
      }
    };

    // here are three DOM elements that make up each of these
    // ui widgets (the forth, afterText, is only created if needed)
    obj.outer = this.makeElement('div', {
        className: 'inpLabel'
        }, parent);

    obj.label = this.makeElement('div', {
        innerHTML: name + ':'
        }, obj.outer);

    obj.input = this.makeElement('input', {
        value: value,
        type: 'text',
        oninput: function() {
          localStorage.setItem('et_' + memberName, this.value);
          cb(obj);
        }
      }, obj.outer);

    return obj;
  }
};
