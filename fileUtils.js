'use strict'

const fs = require('fs')
const path = require('path');
const yaml = require('js-yaml')

function readJSONOrYAML(dir, filename, options) {
    const file = path.join(dir, filename)
    return readJSONOrYAMLFile(file,options)
}

function readJSONOrYAMLFile(file, options) {
    try {

        // console.log('readJSONOrYAMLFile: file=' + file + " options=" + JSON.stringify(options))

        const content = fs.readFileSync(file)
        if(file.endsWith('.json'))
            return JSON.parse(content)
        else {
            return yaml.safeLoad(content)
        }
    } catch(error) {

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

                // console.error("readJSONOrYAMLFile file=" + file)

                // console.log('readJSONFile: # exception=' + error)
                // console.trace('readJSONFile:')
        
                console.log("... ERROR reading file: " + file) 
                console.log("...       " + error)  
                // console.trace()     
            } 
        }
    }
    return {}
}

function ignoreFile(file) {
    // console.log("ignoreFile: " + file)
    if(file === 'DCS') 
        return true;
    return false;
}

function readAllFiles(dirname, pattern, basedir) {
    basedir = basedir || dirname

    let res = {}  

    if(!dirname) return res
    
    try {
        const files = fs.readdirSync(dirname)

        if(!files) return res

        files.forEach(file => {
            const filePath = path.resolve(dirname, file);

            // console.log("filePath=" + filePath + " basedir=" + basedir)

            const stat = fs.statSync(filePath);
            if(stat.isDirectory()) {
                if(!ignoreFile(file)) 
                   res = { ...res, ...readAllFiles(filePath,pattern,basedir) }
            } else if(stat.isFile() && file.endsWith(pattern)) {

                const json = readJSONOrYAML(dirname, file)
                const filename = file.split(".")[0]
                const details = { filename: file, 
                                filepath: filePath.replace(basedir, ""),
                                dir: filePath.replace(basedir + "/", "") ,
                                absPath: dirname,
                                schema: json,
                                json: json,
                                absFilename: filePath
                                }

                // console.log("details.filepath=" + details.filepath)

                if(!res[filename]) {
                    res[filename] = details
                } else {
                    if(!filename.endsWith("Payload")) {
                        console.log(`... issue: already seen ${filename} in ${res[filename].dir}`)
                    }
                }
            }
        })
    
    } catch(error) {
        console.log(`... the schema-used folder is not availble for this API}`)
    }

    return res
}

function readSchema(dir,file) { 

    /*
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


    */

    let filename = file.split('#')[0]
    if(filename.startsWith('schemas') && 
        (dir.endsWith('schemas/') || dir.endsWith('schemas'))) {
        filename = filename.replace('schemas/','')
    }
 
    const filePath = path.resolve(dir, filename);

    const json = readJSONOrYAML(dir, filename)

    // console.log("### readSchema: dir=" + dir + " file=" + file + " filePath=" + filePath)

    return {    
        filename: filename.split('/').pop(), 
        filepath: filePath.replace(dir, ""),
        dir: filePath.replace(dir, "") ,
        absPath: dir,  // filePath,
        schema: json,
        absFilename: filePath
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

const SPACES=4
function writeJSON(apidir, filename, content, overwrite, logging) {
    overwrite = overwrite || false
    logging = logging || false

    try {
        const text = JSON.stringify(content,null,4)
        let absFilename = apidir + '/' + filename
        
        // if(true || !filename.endsWith(".json")) {
        //     console.log("... ... saving " + filename + " to " + absFilename )
        //     console.log(JSON.stringify(content,null,2))
        // }

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


function createDirectory(file) {
    // const dir = path.dirname(file).replace(/^(\.\/)+/,'')
    const dir = path.dirname(file)

    // console.log("file=" + file + " dir=" + dir)

    if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
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
        const absTarget = path.join(target_dir, filename)
        const absSource = path.join(source_dir, filename)

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

module.exports = {
    readJSONOrYAML,
    readJSONOrYAMLFile,
    readAllFiles,
    simplifyPath,
    readSchema,

    writeJSON,
    createDirectory,
    copyFile

}