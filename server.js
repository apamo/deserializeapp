const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const https = require('https');
const sleep = require('sleep-promise');
const rebuild = require('./rebuild');
const app = express();

app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb'})); 

app.post('/rebuild', function (req, res) {

    rebuild.exportImportApp(req.body, function(resp)
    {
      (async () => {
        
        await sleep(5000);
        rebuild.replace(resp,req.body.appId);
        await sleep(5000);
        rebuild.delete(resp);

      })();

      res.send("Rebuild UI process completed for app: " + req.body.appId);		
    });
    
})

app.use(express.static('public'))

https.createServer({
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert')
}, app)
.listen(3000, function () {
  console.log('Example app listening on port 3000! Go to https://localhost:3000/')
})