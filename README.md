# Deserialize App UI in Qlik Sense
This application is a NodeJS utility module to serialize a published Qlik Sense app into a JSON object, read UI changes in JSON format (pass it a sheets object as input parameter in the webform or REST POST call) and rebuild the app's UI entirely which might include some modifications.

This open source project relies on the existing [serializeapp](https://github.com/mindspank/serializeapp) github project and additional code you can see in [rebuild.js](https://github.com/apamo/deserialize-sense-app-ui/blob/main/rebuild.js) to make UI modifications programmatically using [enigma.js](https://github.com/qlik-oss/enigma.js) (i.e. a wrapper for the [Qlik Sense Engine JSON APIs](https://help.qlik.com/en-US/sense-developer/May2021/Subsystems/EngineAPI/Content/Sense_EngineAPI/introducing-engine-API.htm) that facilitates this work) on an existing published app in Qlik Sense Enterprise. 

# Installing node modules 
```
npm install
```

# Generate a self-signed certificate
This project is running express.js server over HTTPS, so you need to use SSL certificates signed by a publicly trusted certificate authority (CA) or create your own self-signed certificate using openssl:
```
openssl req -nodes -new -x509 -keyout server.key -out server.cert
```
*Source: [Running express.js server over HTTPS](https://timonweb.com/javascript/running-expressjs-server-over-https/)

Make sure the two files server.key and server.cert are in the same root directory of this project as the other files, i.e. server.js or rebuild.js

# Running the server
```
node server.js
```
or
```
npm start
```

# How-to test this project
1. Import the Qlik Sense app in your Qlik Sense environment using the QMC > Apps > Import button.
	
	You can download the app from this link: [Dashboard.qvf](https://github.com/apamo/deserialize-sense-app-ui/blob/main/Dashboard.qvf)

2. Testing with the Webform:

	Open your browser of choice and go to https://localhost:3000
	Complete the webform input fields:
	  - Qlik Sense server hostname: e.g. win-derii8ceovp
	  - Template App ID (the published app whose UI you want to modify): e.g. 71807cf2-66f9-4200-900c-45c778337cfc
	  - Sheets object containing the UI modifications: e.g. [sheets object](https://github.com/apamo/deserialize-sense-app-ui/blob/main/sheets.json)
	Clik on the 'Rebuild App' button at the bottom of the webform

3. Testing with the example Qlik Sense app provided here:
	
	- Open the unpublished app to view the UI (there's only one sheet)
	
	- Publish the app to a Stream
	
	- Reload the app in the QMC
	
	- Open the published app and view the new UI
	
	- Line 9 in the Qlik script contains the "sheets" object with the UI modifications. Copy the value between single quotes ' ' and past it in this [JSON editor online](https://jsoneditoronline.org/). Format the JSON data using the toolbar buttons or alternatively use the 'Tree' view to better explore the different objects, their properties, disposition in the Qlik Sense canvas, etc.

4. Using your own app in Qlik Sense to make UI changes programmatically:
	
	- Go to the Qlik Sense Hub and duplicate the app whose UI you want to modify programmatically
	
	- Open the app and go to the 'Data Load Editor'
	
	- Paste the following snippet code at the end of your script:

	```
	Let vHostName = 'win-derii8ceovp';

	Let vAppId = DocumentName();

	Let vAppProps = '{"sheets":[{Sheet1},{Sheet2}]}'; // Paste here the content of your "sheets" object. The node utility might run well but won't show a UI with charts, filters, etc. unless you paste here a valid JSON object


	Let vRequestBody ='{';

	Let vRequestBody = vRequestBody&'"hostname":"$(vHostName)",';

	Let vRequestBody = vRequestBody&'"appId":"$(vAppId)",';

	Let vRequestBody = vRequestBody&'"appName":"$(vAppName)",';

	Let vRequestBody = vRequestBody&'"appProps":$(vAppProps)';

	Let vRequestBody = vRequestBody&'}';

	Let vRequestBody = replace(vRequestBody,'"', chr(34)&chr(34));



	LIB CONNECT TO 'REST_Rebuild_App';

	RestConnectorMasterTable:
	SQL SELECT 
		"col_1"
	FROM CSV (header off, delimiter ",", quote """") "CSV_source" 

	WITH CONNECTION(

	URL "https://localhost:3000/rebuild",

	BODY "$(vRequestBody)",

	HTTPHEADER "Content-Type" "application/json"

	);

	[RestResponse]:
	LOAD	[col_1] as newAppId
	RESIDENT RestConnectorMasterTable;


	DROP TABLE RestConnectorMasterTable;

	Let vHostName = '';
	Let vAppId = '';
	Let vAppProps = '';
	Let vRequestBody = '';
	```

	Pro tip! 
	
	Each time this node utility runs it will write to disk the JSON representation of that app. In turn, that JSON will contain the "sheets" object of your original UI (prior to modifying it), so you can copy it and paste it in your JSON online editor of choice, make some changes and paste the resulting JSON data (in compact format i.e. one line) in the Qlik script provided here that set the vAppProps variable (line 9 of the script)
	Alternatively, you could also use the [serializeapp](https://github.com/mindspank/serializeapp) project to obtain the JSON representation of that app, find the "sheets" object and make modifications. 
