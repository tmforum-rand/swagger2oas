'use strict'

const fs = require('fs')
const path = require('path');
const yaml = require('js-yaml')
const { v4: uuidv4 } = require('uuid')

const commandLineArgs = require('command-line-args')

const Ajv = require('ajv')

const RULESSCHEMA = "tmf.openapi.generator.rules.v1.schema.json"
const OAS3_SCHEMA = "oas3.0.X.schema.json"

const OPERATION_SAMPLES = '/documentation/operation-samples/'
const RESOURCE_SAMPLES = '/documentation/resource-samples/'

const optionDefinitions = [
    { name: 'input', alias: 'i', type: String },
    { name: 'schema-directory', alias: 's', type: String },
    { name: 'output', alias: 'o', type: String },
    { name: 'add-notification-examples', type: Boolean }
]

let options
try {
    options = commandLineArgs(optionDefinitions)
} catch(error) {
    console.log(".. error: " + error)
    process.exit(1)
}

const SCHEMADIR = options['schema-directory']

if(!SCHEMADIR) {
    console.log("Missing input schema directory argument")
    process.exit(1)
}

try {

    const schemas = readAllFiles(SCHEMADIR, 'schema.json')

    for(const [key, schema] of Object.entries(schemas)) {
        if(key.endsWith('RefOrValue') && !key.startsWith('Gc')) {
            // console.log(key)
            const title = schema?.schema?.title
            const definition = schema?.schema?.definitions?.[title]
            // console.log(key + ":" + title)
            // console.log(JSON.stringify(definition,null,2))
            if(!definition.oneOf) {
                const newSchema = createNewSchema(schema, schemas)
                if(isDifferent(schema,newSchema)) {
                    console.log('... re-structure ' + title)
                    // console.log('... ' + JSON.stringify(newSchema,null,2))
                    writeJSON(schema.absPath,schema.filename,newSchema)
                }
            }
        }
    }


} catch(error) {
    console.log("... error: " + error)
}

function isDifferent(a,b) {
    return JSON.stringify(a) != JSON.stringify(b)
}

function createNewSchema(schema, allSchema) {
    const newSchema = JSON.parse(JSON.stringify(schema))
    const title = newSchema?.schema?.title
    const definition = newSchema?.schema?.definitions?.[title]

    if(!definition.oneOf && definition.allOf && definition.allOf?.length>1) {
        const coreTitle = title.replace('RefOrValue','')
        const isRefAlternative = (ref) => title.includes(ref?.['$ref']?.split('#')?.[1])

        const relevant = definition.allOf.every(isRefAlternative)

        if(relevant) {
            definition.oneOf = definition.allOf
            delete definition.allOf
        }
    } 
    if(!definition.properties) definition.properties={}
    
    const gcCandidate = 'Gc' + title
    if(!definition.allOf) {
        if(allSchema[gcCandidate]) {
            definition.allOf =[ {
                $ref: allSchema[gcCandidate].filepath
            }]     
        } else {
            definition.allOf =[ {
                $ref: '../../Core/Extensible.schema.json#Extensible'
            }]
        }
    }

    return newSchema
}  

function writeOpenAPI(oas3,filename) {
    let newRules = yaml.safeDump (oas3, {
        'styles': {
          '!!null': 'canonical' // dump null as ~
        },
        'skipInvalid': false,
        'sortKeys': false,
        'lineWidth': 120 
    })

    fs.writeFileSync(filename, newRules, 'utf8');

    return filename
}

function validate(oas3) {
    const ajv = new Ajv({schemaId: 'auto'});
    ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-04.json'));

    const rulesSchema = readSchemaSync(__dirname + '/' + RULESSCHEMA)
    const oas3Schema = readSchemaSync(__dirname + '/' + OAS3_SCHEMA)

    ajv.addSchema(oas3Schema, OAS3_SCHEMA)
    ajv.addSchema(rulesSchema, RULESSCHEMA)

    const isValid = ajv.validate(RULESSCHEMA, oas3)
    
    if (!isValid) {
        console.log("errors: " + JSON.stringify(ajv.errors,null,2));
    } 
    return isValid
}

function readSchemaSync(file) {
    try {
        const jsonString = fs.readFileSync(file);
        return JSON.parse(jsonString);
    } catch(error) {
        console.log("readSchemaSync: error=" + error)
        return null
    }
}

function readAllFiles(dirname, pattern, basedir) {
    basedir = basedir || dirname

    let res = {}  

    const files = fs.readdirSync(dirname)
    files.forEach(file => {
        const filePath = path.resolve(dirname, file);
        const stat = fs.statSync(filePath);
        if(stat.isDirectory()) {
            res = { ...res, ...readAllFiles(filePath,pattern,basedir) }
        } else if(stat.isFile() && file.includes(pattern)) {
            const json = readJSON(dirname, file)
            const filename = file.split(".")[0]
            const details = { filename: file, 
                            filepath: filePath.replace(basedir + "/", ""),
                            dir: filePath.replace(basedir + "/", "") ,
                            absPath: dirname,
                            schema: json
                            }

            if(!res[filename]) {
                res[filename] = details
            } else {
                console.log(`... issue: already seen ${filename} in ${res[filename].dir}`)
            }
        }
    })

    return res
}

function readJSON(apidir, filename) {
    try {
        const content = fs.readFileSync(apidir + '/' + filename)
        return JSON.parse(content)
    } catch(error) {
        console.log("... error reading file: " + filename)       
    }
    return {}
}


function writeJSON(dirname, filename, content) {
    const absFilename = dirname + '/' + filename
    try {
        const text = JSON.stringify(content,null,2)
        createDirectory(absFilename)

        console.log("... write to " + absFilename)

        fs.writeFileSync(absFilename, text)
    } catch(error) {
        console.log("... error writing file: " + filename)   
        console.log("... ...    absFilename: " + absFilename)       
    
    }
}

function createDirectory(file) {
    const dir = path.dirname(file)
    if(!fs.existsSync(dir)) fs.mkdirSync(dir, true);
} 
