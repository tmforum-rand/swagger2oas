# https://github.com/tmforum-rand/swagger2oas
 
Used to convert V4 to V5 
## Install

`npm install`

## Run rule conversation

```
node rules2oas --input <v4_api_dir>/<v4.rules.yaml> \
      --schema-directory <v5_schema_dir> \
      --api-target-directory <v5_api_dir> \
      --add-notification-examples (optional)\
      --validate-properties  (optional)\
      --overwrite-events (optiona - default false)\
      --overwrite-examples (optional - default false)
```

Output is by default derived from the `<v4.rules.yaml>` using the agreed v5 naming.

Output can also be specfied with `--output <file>`

The `v5_schema_dir` would typically be `OAS_Open_API_And_Data_Model/schemas`.

The `v5_api_dir` would typically be `OAS_Open_API_And_Data_Model/apis/<API name>`

Examples from v4 are located from the input v4 rules file name and assuming `documentation\resource_samples`etc.

