'use strict'

const fs = require('fs')
const path = require('path');
const yaml = require('js-yaml')
const { v4: uuidv4 } = require('uuid')

const commandLineArgs = require('command-line-args')

const Ajv = require('ajv')

const { readAllFiles, readJSONOrYAMLFile, readJSONOrYAML, readSchema } = require('./fileUtils');

const { createEvent } = require('./generateEvent');

const { validateAndUpdateProperties, getValuesByName, extractSchemaName } = require('./schemaUtils');
const { adjustSchema, checkReferences, getObjectsWithProperty } = require('./schemaUtils')

const RULESSCHEMA = "tmf.openapi.generator.rules.v1.schema.json"
const OAS3_SCHEMA = "oas3.0.X.schema.json"

const OPERATION_SAMPLES = '/documentation/operation-samples/'
const RESOURCE_SAMPLES = '/documentation/resource-samples/'

const optionDefinitions = [
    { name: 'input', alias: 'i', type: String },
    { name: 'schema-directory', alias: 's', type: String },
    { name: 'output', alias: 'o', type: String },
    { name: 'add-notification-examples', type: Boolean },
    { name: 'validate-properties', type: Boolean },
    { name: 'overwrite-events', type: Boolean },
    { name: 'overwrite-examples', type: Boolean },
    { name: 'api-target-directory', alias: 't', type: String },
    { name: 'oas-directory-prefix', type: String },

    { name: 'add-missing-schemas', type: Boolean },
    { name: 'old-schema-directory', type: String },

    { name: 'schema-mapping', type: String },
    { name: 'copy-examples', type: Boolean }

]

const notificationMapping= {
    create: 'CreateEvent',
    delete: 'DeleteEvent',
    statechange: 'StateChangeEvent',
    attributevaluechange: 'AttributeValueChangeEvent',
    informationrequired: 'InformationRequiredEvent',
    resolved: 'ResolvedEvent'
}

function randomInt(max) {
    return Math.floor(Math.random() * max) 
}

const reportingSystem = `{
    "id": "${randomInt(1000)}",
    "name": "APP-${randomInt(1000)}",
    "@type": "ReportingResource",
    "@referredType": "LogicalResource"
}`

const source = `
{
    "id": "${randomInt(1000)}",
    "name": "APP-${randomInt(1000)}",
    "@type": "ReportingResource",
    "@referredType": "LogicalResource"
}
`

let options
try {
    options = commandLineArgs(optionDefinitions)
} catch(error) {
    console.log(".. ERROR: " + error)
    console.log(process.argv)
    // console.log(error.stack)

    process.exit(1)
}

const FILE      = options.input

if(!FILE) {
    console.log("Missing input file argument")
    process.exit(1)
}

const ID = (FILE?.match(/TMF[ ]?[0-9]{3}/g) || [""])[0]?.replace(/ /g,'')
const SCHEMADIR = options['schema-directory']
const API_SOURCE_DIR = path.dirname(FILE)
const API_TARGET_DIR = options['api-target-directory']

try {

    let OUTPUT    = options.output
    if(!options.output) {
        if(API_TARGET_DIR) {
            OUTPUT = path.basename(API_TARGET_DIR) + '.rules.yaml'
            OUTPUT = API_TARGET_DIR + '/' + OUTPUT
        } else {
            OUTPUT = path.basename(FILE)
        }
    } 

    const OLD_SCHEMADIR=options['old-schema-directory']

    const newSchemas = readAllFiles(SCHEMADIR, 'schema.json')

    const oldSchemas = OLD_SCHEMADIR!=undefined ? readAllFiles(OLD_SCHEMADIR, 'schema.json') : {}

    let oas3 = convertRules(newSchemas, oldSchemas)

    if(!SCHEMADIR) {
        console.log("... schema directory not specified - unable to add schema references to rules")
    } else {
        const overwrite_events = options['overwrite-events']
        oas3 = addSchema(oas3,SCHEMADIR,overwrite_events,newSchemas)
        // oas3 = addSchema(oas3,SCHEMADIR,overwrite_events,newSchemas)

    }

    if(options['add-missing-schemas']) {
        const OLD_SCHEMADIR=options['old-schema-directory']
        oas3=addMissingSchemas(SCHEMADIR,OLD_SCHEMADIR,newSchemas,oas3)
    }
         
    if(options['copy-examples']) {
        const examples=getValuesByName(oas3,'file')
        const overwrite=true
        const logging=false
        const copiedFiles=[]

        for(const example of examples) {
            const copied=copyFile(API_TARGET_DIR,example,API_SOURCE_DIR,overwrite,logging)
            if(copied) copiedFiles.push(example)
        }

        if(!isEmpty(copiedFiles)) {
            console.log("... copy existing examples:")
            for(const example of copiedFiles) {
                console.log(`... ... ${example.replace(/^.\//i,'')}`)
            }
        }
    }

    if(SCHEMADIR) {
        const overwrite_events = options['overwrite-events']
        oas3 = addNotificationSchema(oas3,SCHEMADIR,overwrite_events,newSchemas)
    }

    if(options['add-notification-examples']) {
        const apidir = path.dirname(OUTPUT)
        const overwrite = options['overwrite-examples']
        oas3 = addNotificationExamples(apidir,oas3,API_SOURCE_DIR,API_TARGET_DIR,overwrite)
    }

    if(options['validate-properties']) {
        oas3 = validateAndUpdateProperties(oas3,SCHEMADIR,newSchemas)
    }

    const validationIssues = validate(oas3)

    if(validationIssues.length>0) {
        console.log("... not converted - validation of generated rules failed")
        console.log('... ... ' + JSON.stringify(validationIssues,null,2).split('\n').join('\n... ... ') )
        process.exit(1)
    }

    checkExistingReferences(oas3,SCHEMADIR)

    writeOpenAPI(oas3,OUTPUT)
    console.log("... rule: output to " + OUTPUT.replace(API_TARGET_DIR + '/',''))


} catch(error) {
    console.log("... ERROR: " + error)
    console.log(error.stack)
}

function addMissingSchemas(schemadir,old_schemadir,newSchemas,oas3) {
    const allSchemas=getValuesByName(oas3,'schema')
  
    if(allSchemas.length==0) return oas3

    const oldSchemas = readAllFiles(old_schemadir, 'schema.json')

    console.log("### oldSchemas " + Object.keys(oldSchemas))    

    const schemaIds = allSchemas.map(item => extractSchemaName(item))
    let allMissing = getAllMissingReferenced(schemaIds, newSchemas, oldSchemas)

    const copiedSchemas=[]
    let updated=false
    while(allMissing.length>0) {
        // console.log("... missingNewSchemas:: " + allMissing)
        for(const missing of allMissing) {
            const old = oldSchemas[missing]
            if(old) {                        
                const newPath = "Tmf/" + path.dirname(old.filepath)

                old.schema = adjustSchema(old.schema)    

                writeJSON(schemadir + '/' + newPath, old.filename, old.schema)
                // console.log("... copied " + old.filename)    
                copiedSchemas.push(old.filename)

                newSchemas[missing].filename = old.filename
                newSchemas[missing].filepath = newPath + '/' + newSchemas[missing].filename

                updated=true
            }
        }
        const newMissing=getAllMissingReferenced(allMissing, newSchemas, oldSchemas)
        allMissing=newMissing.filter(x => !allMissing.includes(x))
    }

    if(copiedSchemas.length>0) {
        console.log('... copy schemas from V4')
        for(const file of copiedSchemas) {
            console.log("... ... " + file)    
        }
    }

    const mappingFile = options['schema-mapping']
    const schemaMapping=readJSONOrYAMLFile(mappingFile) // , {notFoundOK: true})

    // console.log("schemaMapping: " + JSON.stringify(schemaMapping))

    const modified=checkReferences(newSchemas,schemaMapping,schemadir)
    if(modified.length>0) {
        console.log("... " + modified.length + " schemas with corrected references")
        for(const schema of modified) {
            if(schema.updated) {
                const dir=schemadir + '/' + path.dirname(schema.filepath)
                // console.log("modified: " + schema.filename + " dir=" + dir)
                const overwrite=true
                const logging=false
                writeJSON(dir, schema.filename, schema.schema, overwrite, logging)

                if(modified.length<10) {
                    console.log("... ... " + schema.filename)
                }
            } 
        }
    }

    if(updated) {
        const overwrite_events = options['overwrite-events']
        oas3 = addSchema(oas3,SCHEMADIR,overwrite_events,newSchemas)        
    }
    
    return oas3

}
function checkExistingReferences(obj,schemadir,seen) {
    seen = seen || []

    const schemas=[...getObjectsWithProperty(obj,'schema'), ...getObjectsWithProperty(obj,'$ref')]

    for(const item of schemas) {
        const schema=item.schema || item['$ref']

        const id = obj?.title || schema.split('#')[1].split('/').pop()
        if(seen.includes(id)) break
        seen.push(id) 

        // console.log("schema=" + schema)
        const relativePath = schema.split('#')[0]
        // console.log("### relativePath: id=" + id + " relative=" + relativePath)
        if(relativePath==='') {
            console.log("... ISSUE: " + id + " :: invalid relative reference " + schema)
            continue
        }
        let absFilename = schemadir + '/' + relativePath
        const last=schemadir.split('/').pop()
        const first=schema.split('/')[0]

        if(first==last) absFilename=absFilename.replace(first,'')

        absFilename=absFilename.replace('\/\/','\/').replace('schemas/schemas','schemas')

        const referenced=readJSONOrYAMLFile(absFilename,{notFoundOK: true})
        if(isEmpty(referenced)) {
            console.log("... ISSUE: " + id + " :: unable to find referenced schema " + schema)
            console.log("... ... .: " + absFilename)
        } else {  
            // console.log("... " + schema + " " + Object.keys(referenced))
            checkExistingReferences(referenced,path.dirname(absFilename),seen)
        }
    }

}

function getAllMissingReferenced(referenced, newSchemas, oldSchemas,seen,missing) {
    seen = seen || []
    missing = missing || []
    let res = []

    while(!isEmpty(referenced)) {
        const reference = referenced.pop()
        if(!seen.includes(reference)) {
            seen.push(reference)
            // console.log("reference: " + reference)
            // console.log("schema: " + JSON.stringify(newSchemas[reference],null,2))

            const referencedSchema = newSchemas[reference]
            if(!referencedSchema) {
                const existingSchema = oldSchemas[reference]
                if(!existingSchema && !missing.includes(referencedSchema)) {
                    console.log("... ISSUE: " + reference + " not in V5 " + (existingSchema ? " exists in V4" : " missing in V4"))
                    seen.push(reference)
                    missing.push(reference)
                } else {
                    res.push(reference)
                    if(oldSchemas[reference]) {
                        newSchemas[reference] = oldSchemas[reference]
                    }
                }
            } else {
                seen.push(reference)
                const includedReferences = getValuesByName(newSchemas[reference],'$ref').map(item => extractSchemaName(item))
                // console.log("includedReferences: " + includedReferences)
                referenced.push(...includedReferences)
                referenced = referenced.filter(item => !seen.includes(item))
            }
        }
    }

    return res
}

function convertRules(newSchemas, oldSchemas) {
    const oas3 = {}

    oas3.rulesVersion = "1.0.0"
    oas3.api = {}

    let apiDir = path.dirname(FILE);
    let operationSamples = readOperationsSamples(apiDir, OPERATION_SAMPLES);
    let resourceSamples  = readResourceSamples(apiDir, RESOURCE_SAMPLES);

    let fileContents = fs.readFileSync(FILE, 'utf8');
    let data = yaml.safeLoad(fileContents);

    var apiName = Object.keys(data)[0]
    let currentApi = data[apiName]
    apiName = apiName.replace("api ","")?.replace("API ","")?.replace(/'/g,"")
    
    if(!apiName) {
        console.log("... unable to extract api name")
        return oas3
    }
    oas3.api.name = apiName
    oas3.api.shortName = apiName

    oas3.api.description = currentApi?.doc
                ?.split('\n')
                .filter(l => !l.startsWith('## TMF API Reference'))
                .filter(l => !l.includes('Release '))
                .filter(l => !l.includes('Version '))
                .filter(l => !l.includes('Copyright '))
                .filter(l => l.length>0)
                .join('\n')

    let tmfId = currentApi.doc.match(/TMF[ ]?[0-9]{3}/g)
    if(tmfId && tmfId.length>0) 
        tmfId=tmfId[0]
    else 
        tmfId = ID

    tmfId = tmfId.replace(/ /g,'')

    if(!tmfId) {
        console.log("... unable to extract API id (tmfId) from the rules")
        process.exit(1)
    }

    delete currentApi['doc']

    oas3.api.tmfId = tmfId

    oas3.api.hostUrl = currentApi.hostUrl
    oas3.api.basePath = currentApi.basePath
    oas3.api.version = currentApi.version

    delete currentApi['hostUrl']
    delete currentApi['basePath']
    delete currentApi['version']

    delete currentApi['flavors'] // just ignore

    oas3.api.resources = []
    currentApi.resources.forEach(resourceName => {

        let resource = new Object()

        resource.name = resourceName
        resource.schema = ""

        checkIfResourceExists(newSchemas, oldSchemas, resource.name)

        addResourceExample(resourceSamples, resourceName, resource)

        let rules = currentApi['rules ' + resourceName]

        if(!rules) return

        let operations = getArray(rules.operations)

        // console.log("operation=" + operations)
        
        if(operations.includes('NOOPERATION')) {
            
            // console.log("... " + resourceName + " NO OP")

            oas3.api.resources.push(resource)
            delete rules['operations']

        } else {

            let supportedHttpMethods = operations.filter(op => !op.startsWith('NOOP'))

            if(!supportedHttpMethods.length) return

            resource.supportedHttpMethods = {}        
            supportedHttpMethods.forEach(op => {
                resource.supportedHttpMethods[op] = { required: true } 
                addOperationExample(apiDir, operationSamples, resourceName, op, resource.supportedHttpMethods[op])
            })

            delete rules['operations']

            let subMandatory = getSubMandatory(rules)

            // console.log("subMandatory: " + subMandatory)

            processMandatoryInOperation(resource, rules, 'mandatory in post', 'POST', subMandatory)

            processMandatoryInOperation(resource, rules, 'mandatory in patch', 'PATCH', subMandatory)

            processHiddenInOperation(resource, rules, 'hidden in post', 'POST')

            processHiddenInOperation(resource, rules, 'hidden in patch', 'PATCH')

            processPatchable(resource, rules)

            if(rules.notifications) {
                let notifications = getArray(rules.notifications)
                resource.notifications = notifications.map(notification => ({name: notification}))
                delete rules['notifications']
            }

            if(rules.parent) {
                resource.parent = rules.parent
                delete rules['parent']
            }

            oas3.api.resources.push(resource)

        }
            
        if(Object.keys(rules).length===0) {
            delete currentApi['rules ' + resourceName]
        }

    })

    delete currentApi['resources']

    if(Object.keys(currentApi).length>0) {
        console.error()
        console.error("file: " + FILE)
        console.error()
        console.error("remaining properties: " + JSON.stringify(currentApi,null,2))
    }

    return oas3
}

function writeOpenAPI(oas3,filename) {

    oas3 = JSON.parse(JSON.stringify(oas3))

    let newRules = yaml.safeDump (oas3, {
        'styles': {
          '!!null': 'canonical' // dump null as ~
        },
        'skipInvalid': false,
        'sortKeys': false,
        'lineWidth': 120 
    })

    createDirectory(filename)

    fs.writeFileSync(filename, newRules, 'utf8');

    return filename
}

function processPatchable(resource, rules) {
    var patchable = rules.patchable
        
    if(patchable) {
        if(patchable.startsWith('ALL EXCEPT')) {
            patchable = getArray(patchable.replace('ALL EXCEPT','')).map(arg => camelCase(arg))
            if(patchable.length) {
                let patch = getOperationElement(resource,'PATCH')
                var excluded = { 'excludedParameters': patchable }
                if(patch) setProperty(patch, 'parameterRestrictions', excluded)         
            }
        } else {
            patchable = getArray(patchable).map(arg => camelCase(arg))
            if(patchable.length) {
                let patch = getOperationElement(resource,'PATCH')
                setProperty(patch, 'requiredParameters', patchable)
            }
        }
    }
    delete rules['patchable']

}

function processMandatoryInOperation(resource, rules, property, operation, subMandatory) {
    let mandatoryInOperation = getArray(rules[property]).map(arg => camelCase(arg)) 

    // console.log("processMandatoryInOperation: resource=" + resource?.name + " " + operation + " mandatoryInOperation=" + mandatoryInOperation)

    mandatoryInOperation = mandatoryInOperation.concat( subMandatory )

    if(mandatoryInOperation.length) {
        let op = getOperationElement(resource,operation)

        // console.log("processMandatoryInOperation: op=" + op + " mandatoryInOperation=" + mandatoryInOperation) 

        // console.log("processMandatoryInOperation: op keys=" + Object.keys(op))

        if(op) setProperty(op, 'requiredParameters', mandatoryInOperation)

        // console.log("processMandatoryInOperation: resource keys=" + Object.keys(resource))

    }
    delete rules[property]
}
   
function processHiddenInOperation(resource, rules, property, operation) {
    let hiddenInOperation = getArray(rules[property]).map(arg => camelCase(arg))
    if(hiddenInOperation?.length) {
        var op = getOperationElement(resource,operation)
        var excluded = { 'excludedParameters': hiddenInOperation }
        if(op) setProperty(op, 'parameterRestrictions', excluded)
    }
    delete rules[property]
}

function getSubMandatory(rules) {
    let subs = []
    var subMandatory = rules['sub mandatory in patch/post'] || 
                       rules['sub-mandatory in patch/post']

    if(subMandatory) {
       Object.keys(subMandatory).forEach(key => {
          subs = subs.concat( getArrayWithPrefix(key, subMandatory[key]) )
        })

        subs.sort()

        subs = subs.map(arg => camelCase(arg))
        
        delete rules['sub mandatory in patch/post']
        delete rules['sub-mandatory in patch/post']
    }

    return subs
}

function getArray(arg) {
    var res = []
    if(arg) {
        if(typeof arg === 'string') {
            res = arg.replace(/ /g,'').split(',')
            if(typeof res === 'string') res = [res]
        } else if(Array.isArray(arg)) {
            res = arg  
        } 
    }
    return res.filter(arg => arg?.length>0)
}

function getArrayWithPrefix(prefix, arg) {
    var res = []
    if(arg) {
        if(typeof arg == 'string') {
            res = arg.replace(/ /g,'').split(',')
            if(typeof res === 'string') res = [res]
        } else if(Array.isArray(arg)) {
            res = arg
        } 
    }
    return res.filter(elem => elem.length>0).map(elem => prefix + '.' + elem)
}

function camelCase(str) {
    return str.charAt(0).toLowerCase() + str.slice(1)
}

function getOperationElement(resource, method) {
    var ops = resource;
    if(ops.supportedHttpMethods) ops = ops.supportedHttpMethods;
    if(!ops[method]) ops[method]={}
    return ops[method]
}

function setProperty(obj, property, value) {
    
    if(!obj) {
        console.log("... ERROR: unexpected undefined argument to setProperty")
        console.trace()
        return obj
    }

    // if(!obj?.[property]) return obj

    if(Array.isArray(obj[property])) {
        obj[property] = obj[property].concat(value) 
    } else {
        obj[property] = value 
    }
    return obj
}

function validate(oas3) {
    let res=[]
    const ajv = new Ajv({schemaId: 'auto'});
    ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-04.json'));

    const rulesSchema = readSchemaSync(__dirname + '/' + RULESSCHEMA)
    const oas3Schema = readSchemaSync(__dirname + '/' + OAS3_SCHEMA)

    ajv.addSchema(oas3Schema, OAS3_SCHEMA)
    ajv.addSchema(rulesSchema, RULESSCHEMA)

    const isValid = ajv.validate(RULESSCHEMA, oas3)
    
    if (!isValid) {
        res = ajv.errors
    } 
    return res
}

function readSchemaSync(file) {
    try {
        const jsonString = fs.readFileSync(file);
        return JSON.parse(jsonString);
    } catch(error) {
        console.log("... ERROR readSchemaSync: " + error)
        return null
    }
}

function readResourceSamples(apiDir, dir) {
    let result = {}
    let resourceSampleDir = apiDir + dir

    if(!fs.existsSync(resourceSampleDir)) return result

    fs.readdirSync(resourceSampleDir).filter(f => f!='README').forEach(file => {
        let resource = file.split('.')[0]
        result[resource] = file
    });

    result.files = fs.readdirSync(resourceSampleDir)
                        .filter(f => f!='README')

    result.directory = dir

    return result;

}

function readOperationsSamples(apiDir, dir) {
    let result = {}
    let operationsSampleDir = apiDir + dir

    if(!fs.existsSync(operationsSampleDir)) return result

    let samples = fs.readdirSync(operationsSampleDir).filter(f => f.endsWith('.operation_samples.json'))
    if(samples.length) {
        let sampleConfig = fs.readFileSync(operationsSampleDir + '/' + samples[0], 'utf8')
        result = JSON.parse(sampleConfig)
    } 

    result.files = fs.readdirSync(operationsSampleDir)
                        .filter(f => f!=='README')
                        .filter(f => !f.endsWith('.operation_samples.json'))

    result.directory = dir

    return result;
}

function addResourceExample(resourceSamples, resourceName, resource) {
    resource.examples = []

    let sampleSource = resourceSamples[resourceName]
    let file = getSampleFilename(resourceSamples,sampleSource) 
    if(file) {
        let example = { file: file}
        resource.examples.push( example )
    }
    if(resource.examples.length<1) delete resource.examples
}

function addOperationExample(apiDir, operationsSamples, resource, operation, element) {

    let mapping = { GET: [ 'list', 'retrieve' ], 
                    POST: ['create'], 
                    DELETE: ['delete'],
                    PATCH: ['partialupdate'],
                    PUT: ['update']
                 }

    let examples = []

    if(operationsSamples[resource]) {
        let ops = mapping[operation]
        if(!ops) {
            console.log("... ERROR: operation" + operation + " not expected")
            return
        }
        ops.forEach(op => {
            let exampleConfig = operationsSamples[resource][op]

            if(!exampleConfig) return

            let runningLabel = exampleConfig?.samples?.length>1
            for( let no in exampleConfig?.samples) {
                let example = {}

                let sample = exampleConfig.samples[no]

                let seqNo = runningLabel ? ' ' + (no+1) : ''
                example.name = resource + ' ' + op + ' example' + seqNo
                example.description = sample?.description || ""

                if(sample.filtering) {
                    let queryParameters = []
                    let parameters = sample.filtering.split('&').map(p => p.trim())
                    let filtering = ''
                    parameters.forEach( parameter => {
                        let parts=parameter.split('=').map(p => p.trim())   
                        if(parts.length=2) {
                            if(parts[0] == 'fields') {
                                queryParameters.push( {name: parts[0], value: parts[1]} )  
                            } else {
                                if(filtering != '') filtering = filtering + '&'
                                filtering =  filtering + parameter
                            }
                        }         
                    })
                    if(filtering != '') {
                        queryParameters.push({ name: 'filtering', value: filtering} )   
                    }
                    example.queryParameters = queryParameters
                }

                if(sample.objectId) {
                    let pathParameters = []
                    pathParameters.push( {name: 'objectId', value: sample.objectId} ) 
                    example.pathParameters = pathParameters
                }

                example['content-type'] = 'application/json'
                if(sample.contentType) {
                    example['content-type'] = sample.contentType
                } else if( sample['content-type']) {
                    example['content-type'] = sample['content-type']
                }
                if(!example['content-type'].startsWith('application/')) {
                    example['content-type'] = 'application/' + example['content-type'] 
                }

                if(sample.request)  {
                    example.request = { 
                        file: getSampleFilename(operationsSamples,sample.request), 
                        description: sample.description
                    }
                }

                example.isCollection = false
                if(sample.response)  {
                    const description = sample.request ? "Response message" : sample.description;
                    let file = getSampleFilename(operationsSamples,sample.response) 
                    example.response = { 
                        file: file,
                        description: description
                    }
                    example.isCollection = isFileJSONArray(apiDir, file)

                }

                const fileRefs = getObjectsWithProperty(example,'file')
                for(const fileRef of fileRefs) {
                    // console.log("fileRef: " + JSON.stringify(fileRef))
                    if(!fileRef.file?.startsWith('./documentation') && !fileRef.file?.startsWith('documentation')) {
                        fileRef.file = 'documentation/operation-samples/' + fileRef.file
                        fileRef.file = fileRef.file.replace('/./','/')
                    }
                }
                examples.push(example)
            }

        })
        if(examples.length>1) element.examples = examples
    }

}

function isFileJSONArray(dir, file) {
    let res = false        
    try { 
        let content = fs.readFileSync(dir + '/' + file, 'utf-8')
        content = content.trim()
        if(content.startsWith('[')) res=true
    } catch(e) {
    }
    return res
    
}

function getSampleFilename(samples, file) {
    let result = ''

    if(!file) return result

    file = file.replace('$_','')

    let matching = samples.files.filter( f => f.startsWith(file))        
    if(matching.length) {
        result = samples.directory + '/' + matching[0]
    } else {
        result = file + '_sample.json'
    }

    if(result.startsWith('/')) result = '.' + result
    if(!result.startsWith('./')) result = './' + result

    result = result.replace('//','/')

    return result
}

process.on('unhandledRejection', (err) => { 
    console.error(err);
    process.exit(1);
})


function addSchema(oas3,schemadir,overwrite_events,schemas) {
    schemas = schemas || readAllFiles(schemadir,'schema.json')

    Object.keys(schemas).forEach(name => {
        const schema = schemas[name]
        if(schema?.added) {
            // console.log("########## new schema " + name)
            // console.log("########## new schema " + JSON.stringify(schema,2))
            writeJSON(SCHEMADIR + "/Tmf",  schema.filepath, schema.schema)
        }
    })

    oas3.api?.resources?.forEach(resource => {

        if(!resource.schema) {
            console.log("... rule: adding schema for " + resource.name)
            let schema =  schemas[resource.name]?.filepath || "PLACEHOLDER"

            if(!schema.toUpperCase().startsWith("TMF")) schema = "Tmf" + schema

            schema = "schemas/" + schema + "#" + resource.name
            schema = schema.replace("\/\/","\/")
            resource.schema = schema
        } else if(resource.schema && resource.schema.includes("PLACEHOLDER")) {
            let schema =  schemas[resource.name]?.filepath
            schema = "schemas/" + schema + "#" + resource.name
            schema = schema.replace("\/\/","\/")
            resource.schema = schema
        }
    })

    return oas3
}

function addNotificationSchema(oas3,schemadir,overwrite_events,schemas) {
    schemas = schemas || readAllFiles(schemadir,'schema.json')

    oas3.api?.resources?.forEach(resource => {

        resource.notifications?.forEach(notification => {
            if(!notification.schema) {
                console.log("... rule: adding event schema for " + resource.name + " " + notification.name)
                // console.log("notification=" + JSON.stringify(notification,null,2))

                notification.schema = generateEventSchemaReference(resource.name,resource.schema, notification.name, overwrite_events,schemas)
                schemas[notification.name]=readSchema(schemadir,notification.schema)

                // console.log("addNotificationSchema:: schema=" + notification.schema)

            }
        })
    })

    return oas3
}

function readAllFiles_old(dir,basedir) {
    basedir = basedir || dir

    let res = {}  

    if(!basedir) return res

    const files = fs.readdirSync(dir)
    files.forEach(file => {
        const filePath = path.resolve(dir, file);
        const stat = fs.statSync(filePath);
        if(stat.isDirectory()) {
            res = { ...res, ...readAllFiles(filePath,basedir) }
        } else if(stat.isFile()) {
            const filename = file.split(".")[0]
            const details = { filename: file, 
                              filepath: filePath.replace(basedir + "/", ""),
                              dir: filePath.replace(basedir + "/", "") 
                            }

            if(!res[filename]) {
                res[filename] = details
            } else {
                if(!filename.endsWith("Payload")) {
                    console.log(`... ISSUE: already seen ${filename} (${filePath}) in ${res[filename].dir}`)
                }
            }
        }
    })

    return res
}

function generateEventSchemaReference(resource, resourceSchema, notification, overwrite,schemas) {
    let res = resourceSchema

    // console.log("generateEventSchemaReference::res=" + res + " resource=" + resource)

    const relativeReference=resourceSchema.split('#')[0]
    const relativeReferenceParts=relativeReference.split('/')

    relativeReferenceParts.pop()
    relativeReferenceParts.push('Event')

    // res = res.replace(resource,"Event/" + resource)

    let notificationResource = notificationMapping?.[notification.toLowerCase()] || initialUpperCase(notification)
    notificationResource = initialUpperCase(resource) + notificationResource

    relativeReferenceParts.push(notificationResource + '.schema.json' + '#')
    relativeReferenceParts.push('definitions/' + notificationResource)

    res = relativeReferenceParts.join('/')

    // res = res.replace(resource,notificationResource)
    //          .replace('#' + resource, '#/definitions/' + notificationResource)

    // console.log("res=" + res)
    
    const event=res.split('/').splice(-1)[0].split('#').splice(-1)[0]?.replace(".schema.json","")
    const domain = res.split('/')[2]

    // console.log("event=" + event)
    // console.log("domain=" + domain)

    const events = createEvent(resource, resourceSchema, domain, event, notification)
    const files = saveEvents(resourceSchema,events,overwrite)

    // console.log("generateEventSchemaReference:: res=" + res)
    // console.log("generateEventSchemaReference:: notificationResource=" + notificationResource)

    for(const file of files) {
        const filename=file.replace(SCHEMADIR,'')
        const id=file.split('#').pop().split('/').pop().split('.')[0]
        // console.log("filename=" + filename)
        schemas[id] = readSchema(SCHEMADIR,filename)
    }

    // console.log("generateEventSchemaReference::res=" + res)

    return res

}

function initialUpperCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

function saveEvents(domain,events,overwrite) {
    const res=[]
    if(!domain) return

    // console.log("saveEvents:: domain=" + domain)

    const domainPart = domain.replace('schemas/Tmf/','').split('/')[0]

    // console.log("saveEvents:: domainPart=" + domainPart)

    const eventId = events.event['$id']
    const payloadId = events.payload['$id']

    let eventFilename = SCHEMADIR + '/Tmf/' + domainPart + '/Event/' + eventId
    let payloadFilename = SCHEMADIR + '/Tmf/' + domainPart + '/' + payloadId

    // console.log("saveEvents:: eventFilename=" + eventFilename)
    // console.log("saveEvents:: payloadFilename=" + payloadFilename)

    eventFilename = eventFilename.replace('//','/')
    payloadFilename = payloadFilename.replace('//','/')

    createDirectory(eventFilename)
    createDirectory(payloadFilename)

    if (!fs.existsSync(eventFilename) || overwrite) {
        fs.writeFileSync(eventFilename, JSON.stringify(events.event,null,2))
        console.log(`... ... create ${eventFilename.split('schemas/Tmf/')[1]}`)
        res.push(eventFilename)
    }

    if (!fs.existsSync(payloadFilename) || overwrite) {
        fs.writeFileSync(payloadFilename, JSON.stringify(events.payload,null,2))
        console.log(`... ... create ${payloadFilename.split('schemas/Tmf/')[1]}`)
        res.push(payloadFilename)

    }
    return res
}

function createDirectory(file) {
    // const dir = path.dirname(file).replace(/^(\.\/)+/,'')
    const dir = path.dirname(file)

    // console.log("file=" + file + " dir=" + dir)

    if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
} 

function isEmpty(object) {
    if(!object) return true
    if(Array.isArray(object)) {
        return object?.length==0
    } else if(object instanceof Object) {
        return Object.keys(object)?.length==0
    } else 
        return true;
}

function addNotificationExamples(apidir, oas, inputdir, apiTargetDirectory, overwrite) {
    apiTargetDirectory = apiTargetDirectory || '.'

    oas?.api?.resources?.forEach(resource => {
        const resourceExampleSource = resource.examples?.[0]?.file    
        let resourceExample = readJSONOrYAML(apidir, resourceExampleSource, {notFoundOK: true})

        // console.log("resourceExample: inputdir=" + inputdir)
        // console.log("resourceExample: resourceExampleSource=" + resourceExampleSource)

        if(isEmpty(resourceExample)) {
            resourceExample = readJSONOrYAML(inputdir, resourceExampleSource, {notFoundOK: true})
        }

        // console.log("resourceExample: " + JSON.stringify(resourceExample,null,2))

        if(isEmpty(resourceExample)) return

        if(!resourceExampleSource) return
        if(!resourceExample) return

        resource?.notifications?.forEach(notif => {
            const notificationName = initialUpperCase(notif.name)
            let exampleFilename = resourceExampleSource.replace('resource-samples','notification-samples')    
            exampleFilename = exampleFilename.replace(resource.name, notificationName)
            exampleFilename = exampleFilename.replace('.json', '_request.json')

            const examplePayload = createEventSample(oas, resource, notif.name, notificationName, resourceExample)
   
            // console.log("examplePayload=" + JSON.stringify(examplePayload,null,2))

            writeJSON(apiTargetDirectory, exampleFilename, examplePayload, overwrite)

            const description = createEventDescription(resource,notif) 
            
            notif.examples = [{
                name: exampleFilename.split('/').pop().split('.')[0],
                "content-type": "application/json",
                description: description,
                request: {
                    file: exampleFilename,
                    description: description
                }
            }]

        })

    })

    return oas
}

function createEventDescription(resource, event) {
    event = event?.name || event
    let msg
    if(!event.includes('stateChange')) {
        msg = `Message example for ${getEventName(resource,event)} event`
    } else {
        msg = `Message example for ${getEventName(resource,event)} event with ?fields=state property only`
    }
    return msg
}

const SPACES=4
function writeJSON(apidir, filename, content, overwrite, logging) {
    overwrite = overwrite || false
    logging = logging || false

    try {
        const text = JSON.stringify(content,null,4)
        let absFilename = apidir + '/' + filename
        
        // console.log("... absFilename=" + absFilename)

        createDirectory(absFilename)
        absFilename=getFileNameIfMisspelling(absFilename)
        if(!fs.existsSync(absFilename) || overwrite) {
            fs.writeFileSync(absFilename, text)
            if(logging) console.log(`... ... ${filename.replace(/^.\//i,'')}`)
        }
    } catch(error) {
        console.log("... ERROR writing file: " + filename)  
        console.log("... ERROR writing file: " + error)       
    }
}

function getFileNameIfMisspelling(filename) {
    if(fs.existsSync(filename)) return filename;

    const files = fs.readdirSync(path.dirname(filename))
    for(const file of files) {
        if(file.toUpperCase()==filename.toUpperCase()) return file
    }
    return filename
}

function copyFile(target_dir, filename, source_dir, overwrite, logging) {
    try {
        const absTarget = target_dir + '/' + filename
        const absSource = source_dir + '/' + filename
        createDirectory(absTarget)
        if(!fs.existsSync(absTarget)) {
            const content=readJSONOrYAMLFile(absSource,{ignoreCapitalization: true})
            const text = JSON.stringify(content,null,4)
            fs.writeFileSync(absTarget, text)
            if(logging) console.log(`... ... created ${filename.replace(/^.\//i,'')}`)
            return true
        }
    } catch(error) {
        console.log("... ERROR writing file: " + filename)  
        console.log("... ERROR writing file: " + error)       
    }
}

function getEventName(resource,notification) {
    return (resource?.name || resource) + initialUpperCase(notification) + 'Event'
}

function createEventSample(oas, resource, notification, notificationName, resourceExample) {
    const correlationId = uuidv4().substring(0,13)
    const eventId = uuidv4().substring(14)

    const eventName = getEventName(resource, notification)

    const eventTime = new Date()
    const OFFSET = 10000
    const timeOccured = new Date( eventTime.valueOf() - randomInt(OFFSET) )
    const priority = 1+randomInt(5)

    const resourceLowerCase = camelCase(resource.name)

    let event = `
        {
            "correlationId": "${correlationId}",
            "description": "${eventName} illustration",
            "domain": "Commercial",
            "eventId": "${eventId}",
            "eventTime": "${eventTime.toISOString()}",
            "eventType": "${eventName}",
            "priority": "${priority}",
            "timeOcurred": "${timeOccured.toISOString()}",
            "title": "${eventName}",
            "event": {
                "${resourceLowerCase}": {} 
            },
            "reportingSystem": {},
            "source": {},
            "@baseType": "Event",
            "@type": "${eventName}"
        }
    `

    const eventJSON = JSON.parse(event)

    const mandatoryProperties = ['href', 'id', '@type']
    if(notification.includes('stateChange')) {
        const res={}
        mandatoryProperties.forEach(property => {if(resourceExample[property]) res[property] = resourceExample[property]})
        res.state = resourceExample.state
        if(!res.state) {
            console.log(`... ISSUE: missing state property in event sample for ${resource.name}`)
        }
        resourceExample = JSON.parse(JSON.stringify(res))
    } else if(notification.includes('attributeValueChange')) {
        const res={}
        mandatoryProperties.forEach(property => {if(resourceExample[property]) res[property] = resourceExample[property]})

        const keys = Object.keys(resourceExample)
                       .filter(key => (typeof resourceExample[key] === 'object'))

        const selectedProperty = keys[randomInt(keys.length)]

        res[selectedProperty] = resourceExample[selectedProperty]

        resourceExample = JSON.parse(JSON.stringify(res))
    }

    mandatoryProperties.forEach(property => {
        if(resourceExample[property]) {
            if(property==='href') {
                resourceExample[property] = createHRef(oas, resourceLowerCase, resourceExample.id)
            } else if(property==='@type' ) {
                // console.log("property=" + property + " resourceExample[property]=" + resourceExample[property])
                resourceExample[property] = initialUpperCase(resourceLowerCase)
            }
        }
    })

    // console.log("example: " + JSON.stringify(resourceExample,null,2))

    eventJSON.event[resourceLowerCase] = resourceExample
    eventJSON.source = JSON.parse(source)
    eventJSON.reportingSystem = JSON.parse(reportingSystem)

    return eventJSON

}

function createHRef(oas, resource, id) {
    let href = oas?.servers?.[0] || 'http://servername'
    href = href + '/' + resource + '/' + id
    return href
}


function checkIfResourceExists(new_schemas, old_schemas, resource) {
    if(!new_schemas[resource]) {
        // console.log(`... ### ISSUE:resource ${resource} missing in v5`)
        new_schemas[resource] = old_schemas[resource]
        new_schemas[resource].added = true
        // console.log(`...     ${JSON.stringify(new_schemas[resource],2)}`)
    }
}
