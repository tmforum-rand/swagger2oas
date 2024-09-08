#!/bin/bash

API=$1
VERSION=$2
VERSION=`echo $VERSION | sed -e "s/v//"`

# echo "... ... api=$API version=$VERSION"

CREATEGUIDE=/Users/knut/GitHub/oas-tooling/pdf-generation/createguide.py

TARGET_DIR=/Users/knut/GitHub/OAS_Open_API_And_Data_Model
SOURCE_DIR=/Users/knut/Downloads/Open_API_And_Data_Model-$VERSION

TARGET_API=$TARGET_DIR/apis/$API

SOURCE_API=$SOURCE_DIR/apis/$API

OLD_TEMPLATE_DIR=$SOURCE_API/documentation/templates

TARGET_USERGUIDE_DIR=$TARGET_API/documentation/userguide


files=( $OLD_TEMPLATE_DIR/*_template.docx )

if ! [[ -f ${files[0]} ]]; then
    echo "... ISSUE: template directory not found or is empty - assumed to be " ${OLD_TEMPLATE_DIR/$SOURCE_DIR/"."} 
    exit 0
fi

if ! [[ -f ${files[0]} ]]; then
    echo "... ISSUE: template not found in " ${OLD_TEMPLATE_DIR/$SOURCE_DIR/"."} 
    exit 0
fi

template=${files[0]}
echo "... using template directory: " ${OLD_TEMPLATE_DIR/$SOURCE_DIR/"."}
echo "... using template: " ${template/$SOURCE_DIR/"."}

API_ID=`echo $API | sed -e "s/_.*//"`

mkdir -p $API_ID
pandoc $template -f docx -t asciidoc --wrap=none --markdown-headings=atx --extract-media=$API_ID -o $API_ID/output.adoc

python3 $CREATEGUIDE --template $API_ID/output.adoc --target $TARGET_USERGUIDE_DIR --output userguide.adoc

images=( $API_ID/media/*  )

if ! [[ -f ${images[0]} ]]; then
    echo "... ... no images extracted"
else
    echo "... ... copying image files"
    mkdir -p $TARGET_USERGUIDE_DIR/images
    for file in ${images[@]}; do 
        cp $file $TARGET_USERGUIDE_DIR/images
        echo "... ... ... " ${file}
    done
fi

for file in $TARGET_USERGUIDE_DIR/parts/*.adoc; do
    echo "... ... update image references in " ${file/$TARGET_DIR/"."} 
    sed -i .bak "s/$API_ID\/media\///g" $file
    rm ${file}.bak
done

echo 
echo 
echo 

