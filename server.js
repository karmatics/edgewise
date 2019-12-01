// simply call "runApp" in the EdgewiseServer module
// we pass it the directory of the root, as well as the port
// (which will be 7777 if running on localhost)

require('./lib/EdgewiseServer').runServer({
    rootDir: __dirname,
    port: process.env.PORT || 7777
});
