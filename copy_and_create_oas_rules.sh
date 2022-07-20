#!/bin/bash

OLD=./Open_API_And_Data_Model/apis
NEW=./OAS_Open_API_And_Data_Model/apis

setopt NO_NOMATCH

for api in ${OLD}/*; do 
   apiname=`basename $api`
   newapidir="$NEW/$apiname"
   if [[ -d "$newapidir" ]]; then
      echo "api dir exists: $newapidir"
      rules=`ls -s $newapidir/*yaml 2>/dev/null`
      if [[ -z "$rules" ]]; then
         echo "... new rules are missing" 
      fi
   fi 
done


