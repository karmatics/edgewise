// this implements a node.js/expressApp web server which serves the
// static files, as well as providing a synchronizing utility
module.exports = {

  runApp: function(config) {
    var express = require('express');
    var expressApp = express();

    // This is the set of active sessions, that clients know about.
    // Note: being in memory, these go away when the server restarts.
    // Multi-dyno setups aren't going to work either.
    // Would need a database or reddis or the like if we want to scale big.
    var syncSessions = {};

    // force SSL
    if (config.prod === 'production') {
      expressApp.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
          return res.redirect(
            ['https://', req.get('Host'), req.url].join('')
          );
        }
        return next();
      });
    }

    // Make a string of letters and numbers that can be used to
    // uniquely identify something. It is unlikely it will ever
    // conflict, but if we are concerned we can call it in a loop
    // till we have a unique one.
    function makeIdString(len) {
      var possible = 'abcdefghijklmnopqrstuvwxyz0123456789';

      var text = '';
      var max = 26; // shouldn't start with a number
      for (var i = 0; i < len; i++) {
        text += possible.charAt(
          Math.floor(Math.random() * max)
        );
        max = possible.length;
      }
      return text;
    }

    // This will create a new sync session, and is intended to be
    // called by the 'primary' instance. It will return the id
    // of that session, so it can be shared in order to make replicas
    // It expects the following parameters:
    // id:  optional. If provided it will update the session with
    //    that id.
    // times: comma separated list of numbers (of minutes). Floating
    //    point values ok.
    // names: comma separate list of names of participants
    // currentTime: in seconds, the time into the timeline. Zero
    //    if it is at the beginning. Can be floating point.
    // isPlaying: "true" if currently playing (as opposed to paused)
    expressApp.get('/createOrUpdateSyncSession.js', function(
      req,
      res
    ) {
      res.writeHead(200, {
        'Content-Type': 'text/javascript'
      });
      var tmp = {};
      var id = req.query.id;
      var session;
      console.log ('id = ' + id);
      if (id && id.length) {
        // has a session already
        session = syncSessions[id] ;
      }
      if (!session) {
        do {
          id = makeIdString(6);
        } while(syncSessions[id]); // make sure new
        syncSessions[id] = session = {};
      }
      var ts = new Date().getTime();
      session.serverTimestamp = ts;
      session.accessed = ts;
      session.times = req.query.times || '';
      session.names = req.query.names || '';
      session.appTime = req.query.currentTime || '';
      session.isPlaying = req.query.isPlaying || '';
      res.end("setSyncSessionId('" + id + "')");

      // expire old sessions
      var count = 0
      for(var i in syncSessions) {
        session = syncSessions[i];
        if((ts - session.accessed) > 2 * 60 * 60 * 1000) { // 2 hours
          delete (syncSessions[i]);
        }
        count++;
      }

      // If this gets popular, might want to look closer at this.
      // For now, let's just clear it if too many are hitting us.
      if(count > 10000) {
        syncSessions = {};
      }
    });

    // This one is called by the replica.
    // The only parameter is "id", which is the session id.
    // Will return (by calling the function 'syncWithPrimary()')
    // data from the session, including "elapsed" which is the time
    // (in milliseconds) that has passed since the session was updated.
    // The returned data is in an object literal that is passed to
    // the function.
    expressApp.get('/syncReplicaWithPrimary.js', function(
      req,
      res
    ) {
      res.writeHead(200, {
        'Content-Type': 'text/javascript'
      });
      var tmp = {};
      var id = req.query.id;
      var session;
      console.log ('id = ' + id);
      if (id && id.length) {
        // has a session already TODO: check for expired session
        session = syncSessions[id] ;
      }
      var output = {};
      if (!session) {
        output.error = 'no such session';
      } else {
        for (var i in session) {
          output[i] = session[i];
        }
        var ts = new Date().getTime()
        output.elapsed = ts - session.serverTimestamp;
        delete (output.serverTimestamp)
        session.accessed = ts;
      }
      res.end('syncWithPrimary (' + JSON.stringify(output) + ')');
    });

    // this will spit out config data as a json file, as well as
    // query parameters.
    expressApp.get('/showConfig.json', function(
      req,
      res
    ) {
      res.writeHead(200, {
        'Content-Type': 'text/json'
      });
      var tmp = {};
      for (var i in config) {
        tmp[i] = config[i];
      }
      for (var i in req.query) {
        tmp[i] = req.query[i];
      }
      res.end(JSON.stringify(tmp, 0, 2));
    });

    // set up static web server, in the subdirectory www
    expressApp.use('/', express.static(config.rootDir + '/www'));

    expressApp.set('view options', { layout: false });

    // make it do compression
    expressApp.use(require('compression')());

    // serve content over HTTP or HTTPS
    if (config.useSSL) {
      var fs = require('fs');
      require('https')
        .createServer(
          {
            key: fs.readFileSync('key.pem'),
            cert: fs.readFileSync('key.crt'),
            requestCert: false,
            rejectUnauthorized: false
          },
          expressApp
        )
        .listen(config.port);
    } else {
      expressApp.listen(config.port);
    }
  }
};
