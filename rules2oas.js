'use strict'

const fs = require('fs')
const path = require('path');
const yaml = require('js-yaml')
const { v4: uuidv4 } = require('uuid')

const commandLineArgs = require('command-line-args')

const Ajv = require('ajv')

const { createEvent } = require('./generateEvent');
const { validateAndUpdateProperties } = require('./schemaUtils');

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
    { name: 'oas-directory-prefix', type: String }
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
const INPUTDIR = path.dirname(FILE)
const API_TARGET_DIR = options['api-target-directory']

let OUTPUT    = options.output
if(!options.output) {
    OUTPUT = path.basename(FILE).replace('rules.yaml','rules_oas3.yaml')
    if(API_TARGET_DIR) {
        const prefix = options['oas-directory-prefix'] || 'oas'
        OUTPUT = API_TARGET_DIR + '/' + prefix + '/' + OUTPUT
    }
} 

try {
    let oas3 = convertRules()

    if(!SCHEMADIR) {
        console.log("... schema directory not specified - unable to add schema references to rules")
    } else {
        const overwrite_events = options['overwrite-events']
        oas3 = addSchema(oas3,SCHEMADIR,overwrite_events)
    }

    if(options['add-notification-examples']) {
        // console.log("INPUTDIR=" + INPUTDIR)
        const apidir = path.dirname(OUTPUT)
        const overwrite = options['overwrite-examples']
        oas3 = addNotificationExamples(apidir,oas3,INPUTDIR,API_TARGET_DIR,overwrite)
    }
 
    if(options['validate-properties']) {
        // console.log("BEFORE:: " + JSON.stringify(oas3,null,2))

        oas3 = validateAndUpdateProperties(oas3,SCHEMADIR)

        // console.log("AFTER:: " + JSON.stringify(oas3,null,2))

    }

    const validationIssues = validate(oas3)

    if(validationIssues.length>0) {
        console.log("... not converted - validation of generated rules failed")
        console.log('... ... ' + JSON.stringify(validationIssues,null,2).split('\n').join('\n... ... ') )
        
        // console.log( JSON.stringify(oas3,null,2))

        process.exit(1)
    }

    writeOpenAPI(oas3,OUTPUT)

    console.log("... output to " + OUTPUT)


} catch(error) {
    console.log("... ERROR: " + error)
    console.log(error.stack)
}

function convertRules() {
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
    return ops[method]
}

function setProperty(obj, property, value) {
    
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
                    PATCH: ['partialupdate']
                }

    let examples = []

    if(operationsSamples[resource]) {
        let ops = mapping[operation]
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


function addSchema(oas3,schemadir,overwrite_events) {
    const schemas = readAllFiles(schemadir)

    oas3.api?.resources?.forEach(resource => {
        if(!resource.schema) {
            console.log("... rule: adding schema for " + resource.name)
            let schema =  schemas[resource.name]?.filepath
            schema = "schemas/" + schema + "#" + resource.name
            resource.schema = schema ? `${schema}` : "PLACEHOLDER"
        }

        resource.notifications?.forEach(notification => {
            if(!notification.schema) {
                console.log("... rule: adding event schema for " + notification?.name)
                notification.schema = generateEventSchemaReference(resource.name,resource.schema, notification.name, overwrite_events)
            }
        })
    })

    return oas3
}

function readAllFiles(dir,basedir) {
    basedir = basedir || dir

    let res = {}  

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
                console.log(`... issue: already seen ${filename} (${filePath}) in ${res[filename].dir}`)
            }
        }
    })

    return res
}

function generateEventSchemaReference(resource, resourceSchema, notification, overwrite) {
    let res = resourceSchema

    res = res.replace(resource,"Event/" + resource)

    let notificationResource = notificationMapping?.[notification.toLowerCase()] || initialUpperCase(notification)
    notificationResource = initialUpperCase(resource) + notificationResource

    res = res.replace(resource,notificationResource)
             .replace('#' + resource, '#/definitions/' + notificationResource)

    // console.log("res=" + res)
    
    const event=res.split('/').splice(-1)[0].split('#').splice(-1)[0]?.replace(".schema.json","")
    const domain = res.split('/')[2]

    // console.log("event=" + event)
    // console.log("domain=" + domain)

    const events = createEvent(resource, resourceSchema, domain, event, notification)
    saveEvents(resourceSchema,events,overwrite)

    return res

}

function initialUpperCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

function saveEvents(domain,events,overwrite) {
    if(!domain) return

    const domainPart = domain.replace('schemas/Tmf/','').split('/')[0]

    const eventId = events.event['$id']
    const payloadId = events.payload['$id']

    const eventFilename = SCHEMADIR + '/Tmf/' + domainPart + '/Event/' + eventId
    const payloadFilename = SCHEMADIR + '/Tmf/' + domainPart + '/' + payloadId

    createDirectory(eventFilename)
    createDirectory(payloadFilename)

    if (!fs.existsSync(eventFilename) || overwrite) {
        fs.writeFileSync(eventFilename, JSON.stringify(events.event,null,2))
        console.log(`... ... ${eventFilename.split('schemas/Tmf/')[1]}`)
    }

    if (!fs.existsSync(payloadFilename) || overwrite) {
        fs.writeFileSync(payloadFilename, JSON.stringify(events.payload,null,2))
        console.log(`... ... ${payloadFilename.split('schemas/Tmf/')[1]}`)
    }

}

function createDirectory(file) {
    const dir = path.dirname(file).replace(/^(\.\/)+/,'')

    if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
} 

function isEmpty(object) {
    for (const property in object) {
      return false;
    }
    return true;
}

function addNotificationExamples(apidir, oas, inputdir, apiTargetDirectory, overwrite) {
    apiTargetDirectory = apiTargetDirectory || '.'

    oas?.api?.resources?.forEach(resource => {
        const resourceExampleSource = resource.examples?.[0]?.file    
        let resourceExample = readJSON(apidir, resourceExampleSource, {notFoundOK: true})

        // console.log("resourceExample: inputdir=" + inputdir)
        // console.log("resourceExample: resourceExampleSource=" + resourceExampleSource)

        if(isEmpty(resourceExample)) {
            resourceExample = readJSON(inputdir, resourceExampleSource)
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
                name: exampleFilename,
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
function readJSON(apidir, filename, options) {
    try {
        const file = apidir + '/' + filename
        // console.log("file=" + file)
        const content = fs.readFileSync(file)
        // console.log("content=" + content)

        return JSON.parse(content)
    } catch(error) {
        if(!options?.notFoundOK) {
            console.log("... ERROR reading file: " + filename) 
            console.log("... ERROR: " + error)       
        } 
    }
    return {}
}

function writeJSON(apidir, filename, content, overwrite) {
    try {
        const text = JSON.stringify(content,null,2)
        const absFilename = apidir + '/' + filename
        createDirectory(absFilename)
        if(!fs.existsSync(absFilename) || overwrite) {
            fs.writeFileSync(absFilename, text)
            console.log(`... ... ${filename.replace(/^.\//i,'')}`)
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
            console.log('... missing state property in event sample')
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