'use strict'

const fs = require('fs')
const path = require('path');
const yaml = require('js-yaml')
const { v4: uuidv4 } = require('uuid')

const Diff = require('diff');

const gitDiff = require('git-diff')

const commandLineArgs = require('command-line-args')

const Ajv = require('ajv')

const { readAllFiles, readJSONFile, readJSON, readSchema } = require('./fileUtils');

const { createEvent } = require('./generateEvent');

const { validateAndUpdateProperties, getValuesByName, extractSchemaName } = require('./schemaUtils');
const { adjustSchema, checkReferences, getObjectsWithProperty } = require('./schemaUtils')
const { getAllReferences, dereferenceSchemas, flattenSchema, flattenSchemas, extractPaths } = require('./schemaUtils');
const { exit } = require('process');

const RULESSCHEMA = "tmf.openapi.generator.rules.v1.schema.json"
const OAS3_SCHEMA = "oas3.0.X.schema.json"

const OPERATION_SAMPLES = '/documentation/operation-samples/'
const RESOURCE_SAMPLES = '/documentation/resource-samples/'

const optionDefinitions = [
    { name: 'directory', type: String }
]

let options
try {
    options = commandLineArgs(optionDefinitions)
} catch(error) {
    console.log(".. ERROR: " + error)
    console.log(process.argv)
    // console.log(error.stack)

    process.exit(1)
}

const SCHEMA_DIR      = options['directory']

if(!SCHEMA_DIR) {
    console.log("Missing input directory argument")
    process.exit(1)
}

const schema_use={}

try {
 
    const schemas = readAllFiles(SCHEMA_DIR, 'schema.json')
    const apis    = readAllFiles(SCHEMA_DIR, 'rules.yaml')
    
    for(const api of Object.keys(apis)) {
        // console.log("... api: " + api)
        const key=Object.keys(apis[api].json).find(k=>k.startsWith('api'))
        const rules=apis[api].json[key]
        const resources=rules?.resources

        if(resources) {
            // console.log("... rule: " + JSON.stringify(rules,null,2))
            let allRefs = []
            for(const resource of resources) {
                const refs=getAllReferences(schemas,resource)
                allRefs = [...refs, ...allRefs]
            }
            schema_use[api] = allRefs.filter(onlyUnique).sort()
        } else {
            schema_use[api] = []  
        }
        // console.log("... api: " + api)
        // console.log("... refs: " + JSON.stringify(schema_use[api],null,2))

    }

    console.log("{")
    for(const api of Object.keys(apis)) {
        console.log('"' + api + '":')
        for(const ref of schema_use[api]) {
            // console.log("... refs: " + schema_use[api])
            let refs=schemas[ref]?.references || []
            // refs=refs.filter(r => r!=ref)
            // refs=refs.sort()    
            console.log('   "' + ref + '":' + JSON.stringify(refs))
        }
    }
    console.log("}")


} catch(error) {
    console.log("... ERROR: " + error)
    console.log(error.stack)
}

function onlyUnique(value, index, self) {
    return self.indexOf(value) === index
}
