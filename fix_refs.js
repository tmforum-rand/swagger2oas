'use strict'

const fs = require('fs')
const path = require('path');
const yaml = require('js-yaml')
const { v4: uuidv4 } = require('uuid')

const commandLineArgs = require('command-line-args')

const Ajv = require('ajv')

const { readAllFiles, writeJSON } = require('./fileUtils');

const { getObjectsWithProperty } = require('./schemaUtils')

const optionDefinitions = [
    { name: 'schema-directory', alias: 's', type: String }
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

const SCHEMADIR = options['schema-directory']

const schemas = readAllFiles(SCHEMADIR, 'schema.json')

for(const key of Object.keys(schemas)) {

    const schema = schemas[key]
    const updated=updateReferences(schema)

    if(updated) {
        console.log("... ... updated schema " + key)

        const overwrite=true
        const logging=false

        const content = schema.schema

        let absPath = schema.absPath

        writeJSON(absPath, schema.filename, content, overwrite, logging) 

        // console.log("schema=" + JSON.stringify(schema,null,2))


    }
}


function updateReferences(obj,seen) {
    seen = seen || []
    var res = false

    const refs=[...getObjectsWithProperty(obj,'$ref')]

    for(const item of refs) {
        const ref=item['$ref']
    
        var anchor = ref.replace(/[^#]*#/,'')

        if(anchor.startsWith("/")) anchor = anchor.replace(/^\//,'')

        // console.log("ref=" + JSON.stringify(ref) + " anchor=" + anchor)

        if(!anchor.startsWith('definitions/')) {
            // console.log("ref=" + JSON.stringify(ref) + " anchor=" + anchor)
            const newRef = ref.replace(/#.*/,'') + "#" + /definitions/ + anchor

            if(newRef!=ref) {
                console.log("ref=" + JSON.stringify(ref) + " anchor=" + anchor + " newref=" + newRef)
                item['$ref']=newRef
                res=true
            }
        }

    }

    return res

}
