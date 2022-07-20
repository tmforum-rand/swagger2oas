#!/bin/bash

V4_DIR=$1
V5_DIR=$2

OAS_GENERATOR=$3

V4_APIDIR=$V4_DIR/apis/
V5_APIDIR=$V5_DIR/apis/
V4_SCHEMADIR=$V4_DIR/schemas/
V5_SCHEMADIR=$V5_DIR/schemas/

echo $V4_APIDIR

apis=$(shopt -s nullglob dotglob; echo $V4_APIDIR/TMF[6,7]*)
# echo $apis

for f in $apis
do 
   # echo $f
   api=`basename $f`
   files=$(shopt -s nullglob dotglob; echo $f/*.rules.yaml)
   #if (( ${#files} ))
   #then
      for rules in $files # $f/*.rules.yaml
      do 
         echo "\n\n $api :: " `basename $rules` "\n\n"; 
         node rules2oas --input  $rules --schema-directory $V5_SCHEMADIR --add-notification-examples \
             --validate-properties --overwrite-examples --add-missing-schemas \
             --old-schema-directory $V4_SCHEMADIR \
             --schema-mapping ./schema_mapping.json  --copy-examples \
             --api-target-directory $V5_APIDIR/$api
      done
   #fi

   # exit 0

done

exit 0

for f in $apis
do 
   # echo $f
   api=`basename $f`
   rules=$(shopt -s nullglob dotglob; echo $f/*.rules.yaml)
   for rule in $rules
   do 
      echo "\n\n $api :: " `basename $rule` "\n\n"; 

      mkdir $f/oas
      node $OAS_GENERATOR/src/index.js \
            -a $rule \
            -s $V5_SCHEMADIR \
            -o $f/oas -u

   done

done

