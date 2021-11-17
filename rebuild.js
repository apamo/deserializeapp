const fs = require('fs');
const jsonfile = require('jsonfile');
const path = require('path');
const enigma = require('enigma.js');
const schema = require('enigma.js/schemas/12.612.0');
const WebSocket = require('ws');
const { callbackify } = require('util');
const { resolve } = require('path');
const { reject } = require('promise');
const serializeapp = require('serializeapp');
const https = require('https');
const { deserialize } = require('v8');

exports.exportImportApp = async function (input, callback) {

    // Qlik Sense server hostname, source app id to be serialized (export), and target app name to be deserialized (import)
    const hostname = input.hostname;
    const sourceAppId = input.appId;
    var appProps = '';

    // Check if input parameter if string or json object. If string then it has to be parsed.
    if (typeof input.appProps === 'string' || input.appProps instanceof String) {
        appProps = JSON.parse(input.appProps); //-- if using web form to call the nodejs app
    }
    else {
        appProps = input.appProps; //-- if using Qlik script to call the nodejs app 
    }


    //*************** */
    // FUNCTIONS START
    //*************** */


    // 1. Function to duplicate the published app using a QRS API post call.
    async function duplicate(source) {
        return new Promise((resolve, reject) => {

            var options = {
                hostname: `${hostname}`,
                port: 4242,
                path: '/qrs/App/' + source + '/copy?xrfkey=abcdefghijklmnop',
                method: 'POST',
                headers: {
                    'x-qlik-xrfkey': 'abcdefghijklmnop',
                    'X-Qlik-User': 'UserDirectory= ' + hostname + '; UserId= qmi '
                },
                key: fs.readFileSync("C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\client_key.pem"),
                cert: fs.readFileSync("C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\client.pem"),
                ca: fs.readFileSync("C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\root.pem")
            };

            https.get(options, function (res) {
                console.log("Got response: " + res.statusCode);
                res.on("data", function (chunk) {
                    console.log("BODY: " + chunk);
                    var newAppId = JSON.parse(chunk.toString()).id;
                    resolve(newAppId);
                });
            }).on('error', function (e) {
                console.log("Got error: " + e.message);
            });

        });
    }

    // 2. Function to create an app sheet
    function importSheet(app, sheet) {
        return new Promise((resolve, reject) => {
            app.createObject(sheet.qProperty).then((obj) => {
                console.log("Sheet created: " + obj.id);
                importObjects(obj,sheet);
                resolve("OK");
            }).catch((err) => {
                console.log("Error creating sheet" + err);
                reject(err);
            });
        })
    };

    // 3. Function to create an app object, e.g. filterpane, filters, charts, etc.
    async function importObjects(handle, sheet) {
        let childPromises = [];
        var numObjects = sheet.qProperty.cells.length;
        console.log("# objects in sheet: " + numObjects);
        // Creates all objects in a sheet
        for (let j = 0; j < numObjects; j++) {
            handle.createChild(sheet.qChildren[j].qProperty).then((child) => {
                // If the object is a filterpane then also create the individual filter objects
                if (sheet.qProperty.cells[j].type == "filterpane") {
                    importFilters(child,sheet.qChildren[j]);
                }
                childPromises.push("OK")
            }).catch((err) => {
                console.log("Error creating object" + err);
                reject(err);
            });        
        }

        var res = await Promise.all(childPromises);
    };

    // 4. Function to create the individual filter objects grouped inside a filter pane 
    async function importFilters(handle, filterpane) {
        let filterPromises = [];
        var numFields = filterpane.qChildren.length;
        console.log("# fields in filterpane: " + numFields);
        // Add fields to the filterpane
        for (let z = 0; z < numFields; z++) {
            handle.createChild(filterpane.qChildren[z].qProperty).then((filter) => {
                filterPromises.push("OK");
            }).catch((err) => {
                console.log("Error creating filter" + err);
                reject(err);
            });       
        };

        var res = await Promise.all(filterPromises);
    };

    // 5. Function to create a master measure
    function importMeasure(app, measure) {
        return new Promise((resolve, reject) => {
            app.createMeasure(measure).then((measure) => {
                console.log("Master measure created: " + measure.id);
                resolve("OK");
            }).catch((err) => {
                console.log("Error creating measure" + err);
                reject(err);
            });
        })
    };

    // 6. Function to create a master dimension
    function importDimension(app, dimension) {
        return new Promise((resolve, reject) => {
            app.createMeasure(dimension).then((dim) => {
                console.log("Master dimension created: " + dim.id);
                resolve("OK");
            }).catch((err) => {
                console.log("Error creating dimension" + err);
                reject(err);
            });
        })
    };

    // 7. Function to create a master visualization
    function importVisualization(app, visualization) {
        return new Promise((resolve, reject) => {
            app.createObject(visualization.qProperty).then((viz) => {
                console.log("Master visualization created: " + viz.id);
                resolve("OK");
            }).catch((err) => {
                console.log("Error creating visualization" + err);
                reject(err);
            });
        })
    };

    // 8. Function "deserialize" app which takes any json object describing the app layout to me imported

    async function deserializeApp(app, layout) {

        let promises = [];

        // Get the sheets object from the exported app layout and loop over each sheet 
        var sheets = layout.sheets;
        var numSheets = sheets.length;
        console.log("# sheets in app: " + numSheets);
        if (numSheets > 0) {
            for (let i = 0; i < numSheets; i++) {
                promises.push(importSheet(app, sheets[i]));
            }
        }

        // Create master measures if there is any defined
        var measures = layout.measures;
        var numMeasures = measures.length;
        console.log("# master measures in the app: " + numMeasures);
        if (numMeasures > 0) {
            for (let i = 0; i < numMeasures; i++) {
                promises.push(importMeasure(measures[i]));
            }
        }

        // Create master dimensions if there is any defined
        var dimensions = layout.dimensions;
        var numDimensions = dimensions.length;
        console.log("# master dimensions in the app: " + numDimensions);
        if (numDimensions > 0) {
            for (let i = 0; i < numDimensions; i++) {
                promises.push(importDimension(dimensions[i]));
            }
        }

        // Create master objects (visualizations) if there is any defined
        var masterObjects = layout.masterobjects;
        var numMasterObj = masterObjects.length;
        console.log("# master visualizations in the app: " + numMasterObj);
        if (numMasterObj > 0) {
            for (let i = 0; i < numMasterObj; i++) {
                promises.push(importVisualization(masterObjects[i].qProperty));
            }
        }

        app.doSave();
        var res = await Promise.all(promises);

    }

    // 9. Function to override the published app with the new version, i.e. republish app over the existing one in the stream. This is a QRS API put call.
    exports.replace = function (source, destination) {

        var options = {
            hostname: `${hostname}`,
            port: 4242,
            path: '/qrs/App/' + source + '/replace?app=' + destination + '&xrfkey=abcdefghijklmnop',
            method: 'PUT',
            headers: {
                'x-qlik-xrfkey': 'abcdefghijklmnop',
                'X-Qlik-User': 'UserDirectory= ' + hostname + '; UserId= qmi '
            },
            key: fs.readFileSync("C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\client_key.pem"),
            cert: fs.readFileSync("C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\client.pem"),
            ca: fs.readFileSync("C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\root.pem")
        };

        https.get(options, function (res) {
            console.log("Got response: " + res.statusCode);
            res.on("data", function (chunk) {
                console.log("BODY: " + chunk);
            });
        }).on('error', function (e) {
            console.log("Got error: " + e.message);
        });

    };

    // 10. Function to delete the duplicated app - containing the re-built UI - after publishing it to the customer stream. This is a QRS API delete call.
    exports.delete = function (source) {

        var options = {
            hostname: `${hostname}`,
            port: 4242,
            path: '/qrs/app/' + source + '?xrfkey=abcdefghijklmnop',
            method: 'DELETE',
            headers: {
                'x-qlik-xrfkey': 'abcdefghijklmnop',
                'X-Qlik-User': 'UserDirectory= ' + hostname + '; UserId= qmi '
            },
            key: fs.readFileSync("C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\client_key.pem"),
            cert: fs.readFileSync("C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\client.pem"),
            ca: fs.readFileSync("C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\root.pem")
        };

        https.get(options, function (res) {
            console.log("Got response: " + res.statusCode);
            res.on("data", function (chunk) {
                console.log("BODY: " + chunk);
            });
        }).on('error', function (e) {
            console.log("Got error: " + e.message);
        });

    };


    //*************** */
    // FUNCTIONS END
    //*************** */



    //*************** */
    // MAIN FLOW START
    //*************** */

    // Open a WebSocket using the engine port (rather than going through the proxy)
    // We use the certificates and a built-in Qlik service account
    // We connect at the global level, which gives access to APIs in the Global class

    const url = `wss://${hostname}:4747/app/${sourceAppId}`;
    console.log(url);

    const session = enigma.create({
        schema,
        createSocket: () =>
            new WebSocket(url, {
                ca: fs.readFileSync('C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\root.pem'),
                key: fs.readFileSync('C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\client_key.pem'),
                cert: fs.readFileSync('C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\client.pem'),
                headers: {
                    'X-Qlik-User': 'UserDirectory= ' + hostname + '; UserId= qmi '
                },
                rejectUnauthorized: false
            })
    });

    try {

        // Open session with the Qlik Engine
        const global = await session.open();
        console.log('You are connected!');

        // Serialize published app to obtain a JSON object with the full app layout            
        const app = await global.openDoc(sourceAppId);
        var appLayout = await serializeapp(app);
        jsonfile.writeFileSync('appLayout.json', appLayout); //-- debug

        // Set the sheets object resulting from the serialization process with the new version which contains customer modifications
        appLayout.sheets = appProps.sheets;

        // Duplicate the published app. It returns the appId of the new copy of the app sitting in the Personal stream. 
        const newAppId = await duplicate(sourceAppId);

        // Retrieve a new Qlik engine session with enigma to work with the new copy of the app
        const newUrl = `wss://${hostname}:4747/app/${newAppId}`;
        console.log(newUrl);

        const session2 = enigma.create({
            schema,
            createSocket: () =>
                new WebSocket(newUrl, {
                    ca: fs.readFileSync('C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\root.pem'),
                    key: fs.readFileSync('C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\client_key.pem'),
                    cert: fs.readFileSync('C:\\ProgramData\\Qlik\\Sense\\Repository\\Exported Certificates\\.Local Certificates\\client.pem'),
                    headers: {
                        'X-Qlik-User': 'UserDirectory= ' + hostname + '; UserId= qmi '
                    },
                    rejectUnauthorized: false
                })
        });

        // Open the retrieved session to obtain the global handle against the new copy of the app
        const global2 = await session2.open();
        console.log('New connection!');

        // Open the new cope of the app
        global2.openDoc(newAppId).then((app) => {

            // List all the object inside the app: sheets, visualizations, etc.
            app.getAllInfos().then((res) => {

                var numItems = res.length;
                console.log("Sheets to destroy from duplicated app: " + numItems);

                for (let i = 0; i < numItems; i++) {

                    // Remove all existing sheets (old version) from the app
                    if (res[i].qType == 'sheet') {
                        app.destroyObject(res[i].qId).then((obj) => {
                            app.doSave();
                            console.log("Sheet destroyed");
                        });
                    }
                }

            }).catch((err) => {
                console.log(err);
            });

            // Rebuild the UI by calling the deserialize app function
            deserializeApp(app, appLayout);

            // Return ID of the duplicated app back to the server.js and call the exported function "replace" which overrides the existing published app with the new version.
            callback(newAppId);

        }).catch((err) => {
            console.log("Error opening app" + err);
        });

    } catch (err) {
        console.log('An unexpected error thrown async flow:', err);
    }


    //*************** */
    // MAIN FLOW END
    //*************** */

};