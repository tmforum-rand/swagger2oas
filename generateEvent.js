'use strict'

const fs = require('fs')
const path = require('path');
const yaml = require('js-yaml')

function createEventTemplate(DOMAIN, EVENT,NOTIFICATION) {
    const eventTemplate = `
    {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "$id": "${EVENT}.schema.json",
        "title": "${EVENT}",
        "definitions": {
            "${EVENT}": {
                "$id": "#${EVENT}",
                "description": "${EVENT} generic structure",
                "required": ["event"],
                "type": "object",
                "properties": {
                    "event": {
                        "$ref": "../${EVENT}Payload.schema.json#/definitions/${EVENT}Payload"
                    }
                },
                "allOf": [
                    {
                        "$ref": "../../Common/Event.schema.json#Event"
                    }
                ]
            }
        }
    }
    `
    return eventTemplate
}


function createInformationPayloadTemplate(EVENT,RESOURCE) {
    const informationPayloadTemplate = `
    {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "$id": "${EVENT}Payload.schema.json",
        "title": "${EVENT}Payload",
        "definitions": {
            "${EVENT}Payload": {
                "$id": "#${EVENT}Payload",
                "description": "${EVENT}Payload generic structure",
                "required": ["${RESOURCE}"],
                "type": "object",
                "properties": {
                    "${RESOURCE}": {
                        "$ref": "../../Common/InformationRequiredEvent.schema.json#InformationRequiredEvent"
                    }
                }
            }
        }
    }
    `
    return informationPayloadTemplate
}

function createGenericPayloadTemplate(EVENT, RESOURCE, RESOURCE_SCHEMA_REF) {
    RESOURCE_SCHEMA_REF = RESOURCE_SCHEMA_REF.split(path.sep).join(path.posix.sep);    
    const genericPayloadTemplate = `
    {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "$id": "${EVENT}Payload.schema.json",
        "title": "${EVENT}Payload",
        "definitions": {
            "${EVENT}Payload": {
                "$id": "#${EVENT}Payload",
                "description": "${EVENT}Payload generic structure",
                "required": ["${RESOURCE}"],
                "type": "object",
                "properties": {
                    "${RESOURCE}": {
                        "$ref": "${RESOURCE_SCHEMA_REF}"
                    }
                }
            }
        }
    }
    `
    return genericPayloadTemplate
}

function createEvent(resource, resourceSchema, domain, event, notification) {
    const notificationShort = lowerCaseLeading(notification)
    const eventSchema = createEventTemplate(domain, event, notificationShort)

    let payloadSchema
    if(notification.startsWith('informationR')) {
        payloadSchema = createInformationPayloadTemplate(event, notificationShort)

    } else {
        resourceSchema = resourceSchema.split('/').splice(-1)[0]
        payloadSchema= createGenericPayloadTemplate(event, lowerCaseLeading(resource), resourceSchema)
    }

    const res = {
        event:   JSON.parse(eventSchema),
        payload: JSON.parse(payloadSchema)
    }

    return res

}

function lowerCaseLeading(str) {
    return str.charAt(0).toLowerCase() + str.slice(1)
}

module.exports = {
    createEvent
}
