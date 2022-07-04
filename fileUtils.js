'use strict'

const fs = require('fs')

function readJSON(dir, filename, options) {
    const file = dir + '/' + filename
    return readJSONFile(file,options)
}

function readJSONFile(file, options) {
    try {
        const content = fs.readFileSync(file)
        return JSON.parse(content)
    } catch(error) {
        if(!options?.notFoundOK) {
            console.log("... ERROR reading file: " + file) 
            console.log("... ERROR: " + error)       
        } 
    }
    return {}
}

module.exports = {
    readJSON,
    readJSONFile
}