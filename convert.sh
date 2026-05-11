#!/bin/bash

API=$1
VERSION=$2
VERSION=`echo $VERSION | sed -e "s/v//"`

echo api=$API version=$VERSION

OAS_GENERATOR=../oas-tooling/oas-generator/src/index.js
RULE_CONVERTER=rules2oas.js 

# API=TMF699_Sales

TARGET_DIR=/Users/knut/GitHub/OAS_Open_API_And_Data_Model
SOURCE_DIR=/Users/knut/Downloads/Open_API_And_Data_Model-$VERSION

TARGET_API=$TARGET_DIR/apis/$API
TARGET_SCHEMAS=$TARGET_DIR/schemas
TARGET_RULES=$TARGET_API/$API.rules.yaml
TARGET_OAS=$TARGET_API/oas

SOURCE_SCHEMAS=$SOURCE_DIR/schemas
SOURCE_API=$SOURCE_DIR/apis/$API
SOURCE_RULES=`echo $API | sed -e "s/[^_]*_//"`
SOURCE_RULES=$SOURCE_API/$SOURCE_RULES.rules.yaml

node $RULE_CONVERTER \
    --input $SOURCE_RULES \
    --schema-directory $TARGET_SCHEMAS \
    --api-target-directory $TARGET_API \
    --add-notification-examples \
    --validate-properties \
    --overwrite-events \
    --old-schema-directory $SOURCE_SCHEMAS \
    --copy-examples \
    --add-missing-schemas
#   --overwrite-examples

echo
echo
echo

mkdir -p $TARGET_OAS
node $OAS_GENERATOR -a $TARGET_RULES -s $TARGET_SCHEMAS -o $TARGET_OAS


exit 0

echo
echo
echo

files=( $TARGET_OAS/* )
if test -f ${files[0]}; then
    OAS=${files[0]}
    OASTOOLING=/Users/knut/GitHub/oas-tooling/OAS-UserGuide-and-Conformance-Tooling/jars/oastooling-gen5-7.0.2-SNAPSHOT.jar

    RULES=$TARGET_API/$API.rules.yaml

    java -jar $OASTOOLING diagrams \
            --openapi $OAS \
            --rules $RULES \
            --working-directory $TARGET_API \
            --target-directory $TARGET_API/generated/diagrams \
            --generate-images \
            --image-format svg

    API_ID=`echo $API | sed -e "s/_.*//"`

    mkdir -p  $TARGET_API/documentation
    java -jar $OASTOOLING userguide \
        --openapi $OAS \
        --generated-only \
        --image-format svg \
        --rules $RULES \
        --generated-target-directory $TARGET_API/generated/documentation/userguide \
        --working-directory $TARGET_API \
        --target-directory $TARGET_API/documentation/userguide \
        --diagrams $TARGET_API/generated/diagrams/diagrams.yaml  \
        -o ${API_ID}_userguide.adoc


    java -jar $OASTOOLING conformance-data \
        --openapi $OAS  \
        --rules $RULES \
        --working-directory $TARGET_API  \
        --conformance $TARGET_API/documentation/conformance/conformance.yaml \
        --generated-target-directory  $TARGET_API/generated/conformance \
        --target-directory $TARGET_API/documentation/conformance \
        --output ${API_ID}_conformance.yaml

    java -jar $OASTOOLING conformance-guide \
        --openapi $OAS  \
        --rules $RULES \
        --working-directory $TARGET_API  \
        --conformance $TARGET_API/documentation/conformance/${API_ID}_conformance.yaml \
        --generated-target-directory  $TARGET_API/generated/conformance \
        --target-directory $TARGET_API/documentation/conformance \
        --output ${API_ID}_conformance.adoc



fi