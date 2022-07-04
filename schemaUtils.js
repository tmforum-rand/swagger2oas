'use strict'

const fs = require('fs')
const path = require('path');
const yaml = require('js-yaml')

const { readJSONFile } = require('./fileUtils');

function lowerCaseLeading(str) {
    return str.charAt(0).toLowerCase() + str.slice(1)
}

let schemas=null

function validateAndUpdateProperties(oas,schemadir,replace) {
    replace = replace || true

    if(!schemas) schemas = readSchemas(schemadir)

    const resources = oas?.api?.resources

    if(resources) {
        for(let resource of resources) {
            // console.log("validateAndUpdateProperties: resource=" + resource?.name)

            // console.log("validateAndUpdateProperties: resource=" + resource?.name + " " + JSON.stringify(resource,null,2))
            const dereferenced = dereferenceSchema(schemas,resource.name)
            // console.log("validateAndUpdateProperties: dereferenced=" + JSON.stringify(dereferenced,null,2))

            const flattened = flattenSchema(schemas,resource.name)
            // console.log("validateAndUpdateProperties: flattened=" + JSON.stringify(flattened,null,2))

            const paths = extractPaths(flattened).sort()

            // console.log("validateAndUpdateProperties: resource=" + resource?.name + " paths=" + JSON.stringify(paths,null,2))

            const operations = resource?.supportedHttpMethods
            if(operations) {
                const ops = Object.keys(operations)
                for(let op of ops) {
                    // console.log("validateAndUpdateProperties: resource=" + resource?.name + " op=" + op)
                    const opargs = operations[op]
                    if(opargs?.requiredParameters) {
                        const requiredList=opargs?.requiredParameters
                        // console.log("validateAndUpdateProperties: requiredParameters=" + JSON.stringify(requiredList,null,2))
                        const replace={}
                        for(const required of requiredList) {
                            const exists = paths.find(item => item.startsWith(required) || required.startsWith(item))
                            if(!exists) {
                                let foundAs = paths.find(item => item.endsWith(required))
                                if(!replace) {
                                    console.log(`... ISSUE: validate required/restricted: ${required} not found in ${resource.name} schema`)
                                    if(isArray(foundAs))
                                        foundAs = foundAs.map(item => item.replace('.' + required,''))
                                    else if(foundAs) 
                                        foundAs = foundAs.replace('.' + required,'')

                                    if(foundAs) {
                                        console.log("... ... ... found part of " + foundAs)
                                    }
                                } else {
                                    if(!foundAs) {
                                        console.log(`... ISSUE: validate required/restricted: ${required} not found in ${resource.name} schema`)
                                    } else if(!isArray(foundAs)) {
                                        // console.log("... ... ... found as " + foundAs)
                                        replace[required]=foundAs
                                    }
                                }
                            }
                        }
                        if(!isEmpty(replace)) {
                            // console.log("... replace: " + JSON.stringify(replace,null,2))
                            let newRequired=requiredList.filter(item => !replace[item])
                            newRequired.push(...Object.keys(replace).map(key=>replace[key]))
                            // console.log("... newRequired: " + JSON.stringify(newRequired,null,2))
                            
                            opargs.requiredParameters=newRequired.sort()

                        }
                    }
                }
            }
        }
    }

    // console.log("validateAndUpdateProperties: " + schemas)
    // console.log("validateAndUpdateProperties: schemas=" + JSON.stringify(schemas,null,2))

    return oas
}

function extractPaths(schema, prefix) {
    prefix = prefix || ''
    const res = []
    // console.log("extractPaths: schema=" + JSON.stringify(schema,null,2))
    
    // if(prefix.endsWith('agreement')) console.log("prefix=" + prefix + " :: " + JSON.stringify(schema,null,2))

    if(isArray(schema?.allOf)) {
        schema.allOf.map(allOf => extractPaths(allOf,prefix)).forEach(list => res.push(...list))
    }
 
    if(isArray(schema?.oneOf)) {
        schema.oneOf.map(oneOf => extractPaths(oneOf,prefix)).forEach(list => res.push(...list))
    }

    if(schema?.properties) schema=schema.properties

    if(schema) {
        const keys = Object.keys(schema)
        for(const key of keys) {
            const newPrefix = prefix!='' ? prefix + '.' + key : key
            if(schema[key]?.type=='object') {
                res.push(...extractPaths(schema[key],newPrefix))
            } else  if(schema[key]?.type=='array' && schema[key]?.items) {
                res.push(...extractPaths(schema[key].items,newPrefix))
            } else {
               res.push(newPrefix) 
            }
        }
    }

    return res
}

function flattenSchema(schemas,schema) {
    if(!schemas[schema]) {
        console.log("ISSUE: referenced schema not found: " + schema)
        return {}
    }

    if(schemas[schema].flattened) return schemas[schema].flattened

    const flattened = flatten(schemas[schema].dereferenced)

    schemas[schema].flattened = flattened

    // console.log("flattenSchema: schema=" + schema + " res=" + JSON.stringify(flattened,null,2))

    return flattened

}
const schemaSplit = 'schemas'

function flatten(element) {
    const properties=element // {}

    // if(!res.properties) res.properties={}

    if(isArray(element?.allOf)) {
        let flattenAllOfs = element.allOf.map(allOf => flatten(allOf))

        // console.log("flatten: flattenAllOfs=" + JSON.stringify(flattenAllOfs,null,2))

        let flattened = {}
        flattened = Object.assign(flattened, ...flattenAllOfs);

        // console.log("flatten: flattened=" + JSON.stringify(flattened,null,2))

        for(const key of Object.keys(flattened)) {
            if(!properties[key]) properties[key] = flattened[key]
        }
    }
 
    if(isArray(element?.oneOf)) {
        let flattenOneOfs = element.oneOf.map(oneOf => flatten(oneOf))
        let flattened = {}
        flattened = Object.assign(flattened, ...flattenOneOfs);
        for(const key of Object.keys(flattened)) {
            if(!properties[key]) properties[key] = flattened[key]
        }
    }

    if(element?.items) {
        properties.items = flatten(element.items)
    }

    if(element?.properties) {
        for(const key of Object.keys(element.properties)) {
            // console.log("flatten: key=" + key + " property=" + res.properties[key])
            properties[key] = flatten(element.properties[key])
        }

        // for(const key of Object.keys(properties)) {
        //     if(!element.properties[key]) res.properties[key]=properties[key]
        // }

    }

    
    return properties

}

function readSchemas(dir, res) {
    res = res || {}

    const items = fs.readdirSync(dir)
    for(const item of items) {
        // console.log("readSchemas: item=" + item + " res=" + res)
        const itemPath = dir + "/" + item
        const stat = fs.statSync(itemPath)
        if(stat.isDirectory()) {
            res = readSchemas(itemPath, res)
        } else if(stat.isFile()) {
            if(item.endsWith('.schema.json')) {
                const file = item.replace('.schema.json','')
                if(!res[file]) {
                    res[file] = {path: itemPath}
                    res[file].schema = readJSONFile(itemPath)
                } else {
                    let newFile = dir + '/' + item
                    newFile = newFile.replace(/.*\/schemas\//,'schemas/')
                    const oldFile = res[file]?.path.replace(/.*\/schemas\//,'schemas/')
                    console.log('... ISSUE: ' + file + ' in ' + newFile + ' already seen as ' + oldFile)
                }
            }
        }

    }
    return res
}


function dereferenceSchemas(schemas,resource) {
    // for(const schema of Object.keys(schemas)) {
    //     // console.log("schema=" + schema)
    //     const dereferenced = dereferenceSchema(schemas,schema)
    //     // console.log("dereferenced=" + JSON.stringify(dereferenced,null,2))
    // }
    //
}

function dereferenceSchema(schemas,schema,seen) {
    seen = seen || []

    if(!schemas[schema]) {
        console.log("... ISSUE: referenced schema not found: " + schema)
        return {}
    }

    if(schemas[schema].dereferenced) return schemas[schema].dereferenced

    if(seen.includes(schema)) {
        // console.log("ISSUE: recursive schema: " + schema)
        return {}
    }

    seen.push(schema)

    const dereferenced = copy(schemas[schema].schema)
    const definitions = getDefinitions(dereferenced)
    
    // console.log("dereferenceSchema: definitions=" + JSON.stringify(definitions))

    if(isArray(definitions?.allOf)) {
        definitions.allOf = definitions.allOf.map(allOf => dereference(schemas,allOf,seen))
    }
    
    if(isArray(definitions?.oneOf)) {
        definitions.oneOf = definitions.oneOf.map(oneOf => dereference(schemas,oneOf,seen))
    }

    if(definitions?.properties) {
        for(const key of Object.keys(definitions?.properties)) {
            // console.log("dereferenceSchema: schema=" + schema + " property=" + key)
            definitions.properties[key] = dereference(schemas,definitions.properties[key],seen)
        }
    }
    
    schemas[schema].dereferenced = definitions

    return definitions
}

function dereference(schemas,element,seen) {
    // if(element) console.log("dereference:: element=" + JSON.stringify(element,null,2))

    let res = element
    if(res?.['$ref']) {
        // console.log("dereference:: element=" + JSON.stringify(element))
        const referenced = res['$ref'].split('#').pop().split('/').pop().split('.')[0]
        // console.log("dereference:: referenced=" + JSON.stringify(referenced,null,2))
        res = dereferenceSchema(schemas,referenced,seen) 
    } else if(res?.items?.['$ref']) {
        const ref = res?.items?.['$ref']
        const referenced = ref.split('#').pop().split('/').pop().split('.')[0]
        res.items = dereferenceSchema(schemas,referenced,seen) 
    }

    // if(element) console.log("dereference:: res=" + JSON.stringify(res,null,2))

    return res

}

function flattenSchemas(schemas) {
    for(const schema of Object.keys(schemas)) {
        console.log("schema=" + schema)
        schemas[schema].flatten = flattenSchema(schemas,schema)
        console.log("flatten=" + JSON.stringify(schemas[schema].flatten,null,2))
    }
}

// function flattenSchema(schemas,name) {
//     const schema = schemas[name].schema
//     console.log("schema=" + name + " " + JSON.stringify(schema,null,2))

//     const definition = getDefinitions(schema)

//     let properties = {}
//     if(isArray(definition?.allOf)) {
//         for(const allOfItem of definition?.allOf) {
//             properties = {...properties, ...flattenAllOf(schemas,allOfItem)}
//         }
//     }

//     const props = definition?.properties || {}
//     console.log("schema=" + name + " properties" + props)

//     properties = {...properties, ...Object.keys(props)}

//     return properties
// }

function flattenAllOf(schemas,allOf) {
    let properties = {}
    return properties
}

function getDefinitions(schema) {
    return schema?.definitions?.[schema?.title] || {}
}

function isArray(o) {
    return Array.isArray(o)
}

function isEmpty(o) {
    return Object.keys(o).length==0
}

function copy(o) {
    return JSON.parse(JSON.stringify(o))
}

module.exports = {
    validateAndUpdateProperties
}

