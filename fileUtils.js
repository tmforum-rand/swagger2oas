'use strict'

const fs = require('fs')
const path = require('path');
const yaml = require('js-yaml')

function readJSONOrYAML(dir, filename, options) {
    const file = dir + '/' + filename
    return readJSONOrYAMLFile(file,options)
}

function readJSONOrYAMLFile(file, options) {
    try {
        const content = fs.readFileSync(file)
        if(file.endsWith('.json'))
            return JSON.parse(content)
        else {
            return yaml.safeLoad(content)
        }
    } catch(error) {
        // console.log('readJSONFile: # exception=' + error)
        // console.trace('readJSONFile:')

        if(options?.ignoreCapitalization) {
            const dir=path.dirname(file)
            const base=path.basename(file)
            const allFiles=fs.readdirSync(dir)
            const match = allFiles.find(f => f.toLowerCase()==base.toLowerCase())
            if(match) {
                return readJSONOrYAMLFile(match)
            }
        } else {
            if(!options?.notFoundOK) {
                console.log("... ERROR reading file: " + file) 
                console.log("... ERROR: " + error)  
                // console.trace()     
            } 
        }
    }
    return {}
}


function readAllFiles(dirname, pattern, basedir) {
    basedir = basedir || dirname

    let res = {}  

    if(!dirname) return res

    const files = fs.readdirSync(dirname)

    if(!files) return res

    files.forEach(file => {
        const filePath = path.resolve(dirname, file);

        // console.log("filePath=" + filePath + " basedir=" + basedir)

        const stat = fs.statSync(filePath);
        if(stat.isDirectory()) {
            res = { ...res, ...readAllFiles(filePath,pattern,basedir) }
        } else if(stat.isFile() && file.endsWith(pattern)) {
            const json = readJSONOrYAML(dirname, file)
            const filename = file.split(".")[0]
            const details = { filename: file, 
                            filepath: filePath.replace(basedir, ""),
                            dir: filePath.replace(basedir + "/", "") ,
                            absPath: dirname,
                            schema: json,
                            json: json
                            }

            // console.log("details.filepath=" + details.filepath)

            if(!res[filename]) {
                res[filename] = details
            } else {
                console.log(`... issue: already seen ${filename} in ${res[filename].dir}`)
            }
        }
    })

    return res
}

function readSchema(dir,file) { 
    let filename = file.split('#')[0]
    if(filename.startsWith('schemas') && 
        (dir.endsWith('schemas/') || dir.endsWith('schemas'))) {
        filename = filename.replace('schemas/','')
    }
 
    const filePath = path.resolve(dir, filename);

    const json = readJSONOrYAML(dir, filename)

    return {    
        filename: filename.split('/').pop(), 
        filepath: filePath.replace(dir, ""),
        dir: filePath.replace(dir, "") ,
        absPath: filePath,
        schema: json
    }

}


function simplifyPath(path) {
    const regexp=/[A-Za-z]+\/\.\.\//i
    let res=path
    let cont=true
    while(cont) {
        const old=res
        res=res.replace(regexp,'')
        cont=(res!=old)
    }

    return res
}

module.exports = {
    readJSONOrYAML,
    readJSONOrYAMLFile,
    readAllFiles,
    simplifyPath,
    readSchema
}