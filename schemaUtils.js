'use strict'

const fs = require('fs')
const path = require('path');
const yaml = require('js-yaml')

const { readJSONFile, simplifyPath } = require('./fileUtils');

function lowerCaseLeading(str) {
    return str.charAt(0).toLowerCase() + str.slice(1)
}

const checkedSchemas=[]

function checkReferencesForSchema(id, schemas, schemaMapping, schemaDirectory) {
    const res=[]

    if(checkedSchemas.includes(id)) {
        return res
    }

    checkedSchemas.push(id)

    // console.log("id=" + id)
    const schema=schemas[id]?.schema
    if(schema) {
        const dir=schemas[id]?.absPath
        const containingFile=schemas[id]?.filename

        const refs=getObjectsWithProperty(schema,'$ref')
        for(const refItem of refs) {
            const ref=refItem['$ref']
            const refId=extractSchemaName(ref)
            
            // console.log("checkReferences::schema=" + id + " refId=" + refId )
            
            if(checkedSchemas.includes(refId)) continue

            // console.log("checkReferences::refId=" + refId + " refItem=" + JSON.stringify(refItem))

            if(schemaMapping[refId]) {
                // console.log("### schemaMapping:" + schemaMapping[refId])
                const filename=schemaMapping[refId].split('#')[0]
                const absFilename=path.join(schemaDirectory,filename)

                const relativePath=getRelativePath(dir,path.dirname(absFilename))
                const newRef=relativePath + '/' + path.basename(filename) + '#' + schemaMapping[refId].split('#')[1]

                // console.log(id + ' new ref=' + newRef)
                if(refItem['$ref']!=newRef) {

                    // console.log("###2 update ref id=" + id + " oldRef=" + refItem['$ref'] + " newRef=" + newRef)

                    getRelativePath(dir,path.dirname(absFilename),true)

                    refItem['$ref']=newRef
                    schemas[id].updated=true
                    res.push(schemas[id])
                }

            } else {
                // console.log("ref=" + ref)

                let filename=path.join(dir,ref).split('#')[0]
                filename=simplifyPath(filename)

                const stat=fs.existsSync(filename)
                if(!stat) {
                    // let existAtLocation=schemas[refId]?.absFilename || ''
                    let existAtLocation=schemas[refId]?.absPath || ''

                    // console.log("ref=" + ref + " filename=" + filename)

                    // console.log("schema=" + id + " ref=" + ref + " existAtLocation=" + existAtLocation)

                    // existAtLocation=existAtLocation.replace(OLDDIR,NEWDIR)

                    // if(!existAtLocation.startsWith(NEWDIR)) {
                    //     existAtLocation=NEWDIR + "/" + existAtLocation
                    //     existAtLocation=existAtLocation.replace("\/\/","\/")
                    // }
                    // console.log("ref=" + ref + " existAtLocation=" + existAtLocation + " dir=" + dir)

                    if(existAtLocation) {
                        // console.log(refId + " not found as " + filename + " " + existAtLocation)
                        // console.log(id + " at location " + dir)

                        const containingAtDir = dir.replace(containingFile,'')
                        existAtLocation = existAtLocation.replace(filename,'')

                        const relativePath=getRelativePath(containingAtDir,existAtLocation)

                        const newRef=relativePath + '/' + path.basename(filename) + '#' + ref.split('#')[1]

                        // console.log(id + ' new ref=' + newRef)
                        if(refItem['$ref']!=newRef) {

                            // console.log("###1 update ref id=" + id + " oldRef=" + refItem['$ref'] + " newRef=" + newRef)
                            // console.log("   dir=" + dir + " existAtLocation=" + existAtLocation)

                            getRelativePath(containingAtDir,existAtLocation,true)

                            refItem['$ref']=newRef
                            schemas[id].updated=true
                            res.push(schemas[id])
                        }
                    }

                } else {

                    // console.log("###2 checkReferencesForSchema id=" + id + " stat=" + stat)
                    // found in expected location
                }
            }
        }
    }

    return res
}


function checkReferences(schemas,schemaMapping,schemaDirectory) {
    const res=[]
    const ids = Object.keys(schemas)
    for(const id of ids) {
        checkReferencesForSchema(id, schemas, schemaMapping, schemaDirectory)

        // // console.log("id=" + id)
        // const schema=schemas[id]?.schema
        // if(schema) {
        //     const dir=schemas[id]?.absPath
        //     const refs=getObjectsWithProperty(schema,'$ref')
        //     for(const refItem of refs) {
        //         const ref=refItem['$ref']
        //         const refId=extractSchemaName(ref)
        //         // console.log("checkReferences::refId=" + refId)

        //         if(schemaMapping[refId]) {
        //             // console.log("### schemaMapping:" + schemaMapping[refId])
        //             const filename=schemaMapping[refId].split('#')[0]
        //             const absFilename=path.join(schemaDirectory,filename)

        //             const relativePath=getRelativePath(dir,path.dirname(absFilename))
        //             const newRef=relativePath + '/' + path.basename(filename) + '#' + schemaMapping[refId].split('#')[1]

        //             // console.log(id + ' new ref=' + newRef)
        //             if(refItem['$ref']!=newRef) {
        //                 refItem['$ref']=newRef
        //                 schemas[id].updated=true
        //                 res.push(schemas[id])
        //             }

        //         } else {
        //             // console.log("ref=" + ref)

        //             let filename=path.join(dir,ref).split('#')[0]
        //             filename=simplifyPath(filename)

        //             const stat=fs.existsSync(filename)
        //             if(!stat) {
        //                 let existAtLocation=schemas[refId]?.absPath || ''
        //                 if(existAtLocation) {
        //                     // console.log(refId + " not found as " + filename + " " + existAtLocation)
        //                     // console.log(id + " at location " + dir)
        //                     const relativePath=getRelativePath(dir,existAtLocation)
        //                     const newRef=relativePath + '/' + path.basename(filename) + '#' + ref.split('#')[1]

        //                     // console.log(id + ' new ref=' + newRef)
        //                     if(refItem['$ref']!=newRef) {
        //                         refItem['$ref']=newRef
        //                         schemas[id].updated=true
        //                         res.push(schemas[id])
        //                     }
        //                 }
        //             }
        //         }
        //     }
        // }
    }
    return res
}



function getRelativePath(base,referenced,logging) {
    logging = logging || false

    let baseParts
    let referencedParts
    
    // base = base.replace(/\/.*\.schema\.json/,"")
    // referenced = referenced.replace(/\/.*\.schema\.json/,"")

    if(base === referenced) {
        return '.'
    }

    if(base.includes('schemas')) {
        const sub=base.split('schemas')[1]
        baseParts=sub.split('/')
    } else {
        baseParts=base.split('/')
    }

    if(referenced.includes('schemas')) {
        const sub=referenced.split('schemas')[1]
        referencedParts=sub.split('/')
    } else {
        referencedParts=referenced.split('/')
    }

    let idx=0
    const minLength=Math.min(baseParts.length,referencedParts.length)

    while(idx<minLength && baseParts[idx]==referencedParts[idx]) idx++
    
    // if(logging) {
    //     console.log("### getRelativePath:       base=" + base + " idx=" + idx)
    //     console.log("### getRelativePath: referenced=" + referenced + " idx=" + idx)
    //     console.log("### getRelativePath:       next=" + baseParts[idx])
    // }

    let prefix=''
    let pivot=idx
    while(idx<baseParts.length) {
        if(prefix!='') prefix=prefix+'/'
        prefix = prefix + ".."
        idx++
    }
    while(pivot<referencedParts.length) {
        prefix = prefix + '/' + referencedParts[pivot]
        pivot++
    }

    // console.log("getRelativePath:     prefix=" + prefix)

    if(prefix==='') prefix='.'

    return prefix
}

function adjustSchema(schema) {    
    const newSchema = copy(schema)
    const title = newSchema?.title
    const definition = newSchema?.definitions?.[title]

    if(!definition) {
        console.log("... ERROR: missing definitions in schema: " + JSON.stringify(newSchema,null,2))
        return newSchema
    }

    if(!definition?.oneOf && definition?.allOf && definition.allOf?.length>1) {
        const coreTitle = title.replace('RefOrValue','')
        const isRefAlternative = (ref) => title.includes(ref?.['$ref']?.split('#')?.[1])

        const relevant = definition.allOf.every(isRefAlternative)

        if(relevant) {
            definition.oneOf = definition.allOf
            delete definition.allOf
        }
    } 
    if(!definition?.properties) definition.properties={}
    
    return newSchema
}  

function validateAndUpdateProperties(oas, schemadir, schemas, add_if_missing) {
    schemas = schemas || readAllFiles(schemadir, 'schema.json')

    const resources = oas?.api?.resources

    if(resources) {
        
        for(let resource of resources) {

            const missing=[]
            const errors=[]

            const missing_properties=[]

            // console.log("validateAndUpdateProperties: resource=" + resource?.name)

            // console.log("validateAndUpdateProperties: resource=" + resource?.name + " " + JSON.stringify(resource,null,2))
            const dereferenced = dereferenceSchema(schemas,resource.name,[],missing,add_if_missing)
            // console.log("validateAndUpdateProperties: dereferenced=" + JSON.stringify(dereferenced,null,2))

            const flattened = flattenSchema(schemas,resource.name)
            // console.log("validateAndUpdateProperties: flattened=" + JSON.stringify(flattened,null,2))

            const paths = extractPaths(flattened).sort()

            // console.log("validateAndUpdateProperties: resource=" + resource?.name + "\n paths=" + JSON.stringify(paths,null,2))

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
                                    const issue=`${required} not found in ${resource.name} schema`
                                    if(!missing_properties.includes(required)) missing_properties.push(required)
                                    if(!errors.includes(issue)) {
                                        console.log(`... ISSUE: validate required/restricted: ${issue}`)
                                        errors.push(issue)
                                    }
                                    if(isArray(foundAs))
                                        foundAs = foundAs.map(item => item.replace('.' + required,''))
                                    else if(foundAs) 
                                        foundAs = foundAs.replace('.' + required,'')

                                    if(foundAs) {
                                        console.log("... ... ... found part of " + foundAs)
                                    }
                                } else {
                                    if(!foundAs) {
                                        const issue=`${required} not found in ${resource.name} schema`
                                        if(!missing_properties.includes(required)) missing_properties.push(required)
                                        if(!errors.includes(issue)) {
                                            console.log(`... ISSUE: validate required/restricted: ${issue}`)
                                            errors.push(issue)
                                        }
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

            if(missing_properties.length>0) {
                // console.log("### validateAndUpdate resource=" + resource.name + " missing=" + JSON.stringify(missing_properties))
                add_properties(resource.name, schemas, missing_properties)
            }
        }
    }

    // console.log("validateAndUpdateProperties: " + schemas)
    // console.log("validateAndUpdateProperties: schemas=" + JSON.stringify(schemas,null,2))

    return oas
}

function add_properties(schema, schemas, missing_properties) {
    const oldSchema = schemas.OLD[schema]
    
    // console.log("add_properties: schema=" + schema + " properties=" + missing_properties)

    const definitions = getDefinitions(oldSchema.schema)

    // console.log("add_properties: schema=" + schema + " definitions=" + JSON.stringify(definitions,null,2))

    const missing = [...new Set(missing_properties.map((p) => p.replace(/\..*/,"")))]

    for(const property of missing) {
        // console.log("add_properties: property=" + property)
        const def = get_property(property, definitions)
        if(def) {
            // console.log("add_properties: property=" + property + " definition=" + JSON.stringify(def))
            addPropertyToSchema(schema,schemas,property,def)
        } else {
            console.log("... ISSUE: property " + property + " is found in old rule file, but missing in both old and new schemas")
        }
    }
}

function get_property(property, definition) {
    return definition?.properties?.[property]
}

function addPropertyToSchema(schema,schemas,property,def) {
    const schemaTarget = schemas[schema].schema
    const definition = getDefinitions(schemaTarget)

    if(definition?.properties) {
        definition.properties[property] = def
    } else {
        definition['properties'] = {}
        definition.properties[property] = def
    }
    console.log("... ... adding property " + property + " to schema " + schema)

    schemas[schema].updated = true
}

function extractPaths(schema, prefix) {
    prefix = prefix || ''
    let res = []
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

    res = res.filter(onlyUnique);

    return res
}

function onlyUnique(value, index, self){
    return self.indexOf(value) === index
}
function flattenSchema(schemas,schema) {
    if(!schemas[schema]) {
        // console.log("ISSUE: referenced schema not found: " + schema)
        return {}
    }

    if(schemas[schema].flattened) return schemas[schema].flattened

    const flattened = flatten(schemas[schema].deref)

    schemas[schema].flattened = flattened

    // console.log("flattenSchema: schema=" + schema + " res=" + JSON.stringify(flattened,null,2))

    return flattened

}
const schemaSplit = 'schemas'

function flatten(element) {
    const properties=element // {}

    // console.log(`flatten:: ${element}`)
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

function readSchemas_old(dir, res) {
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


function dereferenceSchemas(schemas) {
    for(const schema of Object.keys(schemas)) {
        if(!schemas[schema].deref) {
            const dereferenced = dereferenceSchema(schemas,schema)
            schemas[schema].deref=dereferenced
        }
    }
}


function dereferenceSchema(schemas,schema,seen,missing,add_if_missing) {
    seen = seen || []
    missing = missing || []

    // console.log("dereferenceSchema: missing= " + missing + " add_if_missing=" + add_if_missing)

    if(!schemas[schema]) {
        // console.log("dereferenceSchema: schema not found: " + schema)
        var copiedFromOld=false
        if(!missing.includes(schema)) {
            console.log("... ISSUE: referenced schema not found in target: " + schema)
            missing.push(schema)
            if(add_if_missing) {
                // console.log("... SHOULD add schema from v4")
                if(schemas?.OLD?.[schema]) {
                    // console.log("... exists in v4")
                    // console.log("... " + JSON.stringify(schemas?.OLD?.[schema],null,2))

                    console.log("... adding schema " + schema + " from v4")

                    copiedFromOld=true
                    schemas[schema]=schemas?.OLD?.[schema]
                    schemas[schema].copied=true

                    console.log("... #1 COPIED schema=" + JSON.stringify(schemas[schema],null,2))

                } 
            }
        }
        if(!copiedFromOld) return {}
    }

    // console.log("dereferenceSchema: schema.deref= " +  schemas[schema].deref )

    if(schemas[schema].deref) return schemas[schema].deref

    if(seen.includes(schema)) {
        // console.log("ISSUE: recursive schema: " + schema)
        return {}
    }

    // console.log("dereferenceSchema: missing= " + missing)

    seen.push(schema)

    const dereferenced = copy(schemas[schema].schema)
    const definitions = getDefinitions(dereferenced)
    
    // console.log("dereferenceSchema: definitions=" + JSON.stringify(definitions))

    if(isArray(definitions?.allOf)) {
        definitions.allOf = definitions.allOf.map(allOf => dereference(schemas,allOf,seen,missing,add_if_missing))
    }
    
    if(isArray(definitions?.oneOf)) {
        definitions.oneOf = definitions.oneOf.map(oneOf => dereference(schemas,oneOf,seen,missing,add_if_missing))
    }

    if(definitions?.properties) {
        for(const key of Object.keys(definitions?.properties)) {
            // console.log("dereferenceSchema: schema=" + schema + " property=" + key)
            definitions.properties[key] = dereference(schemas,definitions.properties[key],seen,missing,add_if_missing)
        }
    }
    
    schemas[schema].deref = definitions

    return definitions
}

function dereference(schemas,element,seen,missing,add_if_missing) {
    
    // if(element) console.log("dereference:: element=" + JSON.stringify(element,null,2))

    let res = element
    if(typeof res === 'string') {
        res = schemas[element]
    }

    if(res?.['$ref']) {
        // console.log("dereference:: element=" + JSON.stringify(element))
        const referenced = res['$ref'].split('#').pop().split('/').pop().split('.')[0]
        // console.log("#1 dereference:: referenced=" + JSON.stringify(referenced,null,2))
        res = dereferenceSchema(schemas,referenced,seen,missing,add_if_missing) 

    } else if(res?.items?.['$ref']) {
        const ref = res?.items?.['$ref']
        const referenced = ref.split('#').pop().split('/').pop().split('.')[0]
        // console.log("#2 dereference:: referenced=" + JSON.stringify(referenced,null,2))

        res.items = dereferenceSchema(schemas,referenced,seen,missing,add_if_missing) 

    } else if(res?.properties) {
        for(const key of Object.keys(res?.properties)) {
            // console.log("#3 dereferenceSchema: property=" + key)
            res.properties[key] = dereference(schemas,res.properties[key],seen,missing,add_if_missing)
        }
    }

    // if(element) console.log("dereference:: res=" + JSON.stringify(res,null,2))

    return res

}

function flattenSchemas(schemas) {
    for(const schema of Object.keys(schemas)) {
        // console.log("schema=" + schema)
        schemas[schema].flattened = flattenSchema(schemas,schema)
        // console.log("flatten=" + JSON.stringify(schemas[schema].flattened,null,2))
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

function getValuesByName(obj,name) {
    let res=[]

    // console.log("..getValuesByName: obj=" + JSON.stringify(obj))

    if(isArray(obj)) {
        for(const item in obj) {
            const element = obj[item]
            // console.log("..element: " + JSON.stringify(element,null,1))
            res.push(...getValuesByName(element,name))
        }    
    } else if(obj instanceof Object) {
        // console.log("..getAllSchemas: " + Object.keys(obj))
        for(const key of Object.keys(obj)) {
            if(key==name) {
                res.push(obj[key]) 
            } else {
                res.push(...getValuesByName(obj[key],name))
            }
        }
    } 

    return res
}

function getObjectsWithProperty(obj,name) {
    let res=[]

    // console.log("..getObjectsWithProperty: obj=" + JSON.stringify(obj))

    if(isArray(obj)) {
        for(const item in obj) {
            const element = obj[item]
            // console.log("..element: " + JSON.stringify(element,null,1))
            res.push(...getObjectsWithProperty(element,name))
        }    
    } else if(obj instanceof Object) {
        // console.log("..getAllSchemas: " + Object.keys(obj))
        for(const key of Object.keys(obj)) {
            if(key==name) {
                res.push(obj) 
            } else {
                res.push(...getObjectsWithProperty(obj[key],name))
            }
        }
    } 

    return res
}

const possibleInvalidReference=[]
function extractSchemaName(s) {
    const last = s.split("#").pop().split('/').pop()

    const file = s.replace(/#.*/,"").split('/').pop().replace(/\..*/,"")

    const ignoreFiles = [ "GeoJSON", "PLACEHOLDER"]

    if(last != file && file.length>0 && !ignoreFiles.includes(file) && !possibleInvalidReference.includes(last)) {
        possibleInvalidReference.push(last)
        console.log("... possible issue with reference: " + s)
        // console.log("last=" + last + " file=" + file)
    }

    return last

}

function getAllReferences(schemas,reference,seen) {
    seen = seen || []
    let res= []

    if(!seen.includes(reference)) {
        const element=schemas[reference]
        seen.push(reference)
    
        let refs=getObjectsWithProperty(element,'$ref')

        refs=refs.map(x => getRef(x)).filter(onlyUnique)

        for(const ref of refs) {
            if(!seen.includes(ref)) {
                const newRefs=getAllReferences(schemas,ref,seen)
                if(!isEmpty(newRefs)) res=[...res, ...newRefs]
            }
        }

        res.push(reference)
        if(element) element.references=res.filter(r=>r!=reference).sort()

    }

    // res = res.filter(r => r!=reference)
    return res
}

function getRef(o) {
    let ref=o['$ref']
    ref=ref?.split('#').pop().split('/').pop()
    return ref
}

var OLDDIR
var NEWDIR

function setEnvironment(olddir, newdir) {
    OLDDIR=olddir
    NEWDIR=newdir
}

module.exports = {
    validateAndUpdateProperties,
    getValuesByName,
    getObjectsWithProperty,
    extractSchemaName,
    adjustSchema,
    checkReferences,
    dereferenceSchema, 
    dereferenceSchemas,
    flattenSchema, 
    flattenSchemas,
    extractPaths,
    getAllReferences,
    checkReferencesForSchema,

    setEnvironment

}

