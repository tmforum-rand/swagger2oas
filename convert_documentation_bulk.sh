#!/bin/bash
INPUT=convert_input.txt

TARGET_DIR=/Users/knut/GitHub/OAS_Open_API_And_Data_Model/apis

while IFS=' ' read -ra API; do

    if [[ ${API[0]} == TMF* ]]; then

        echo "... processing documentation ${API[@]}"

        TARGET_API=$TARGET_DIR/${API[0]}

        ./convert_documentation.sh ${API[0]} ${API[1]} 1> $TARGET_API/convert_documentation_log_${API[0]}.txt 2>&1

    fi

    # exit 0

done < "$INPUT"
