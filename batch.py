import subprocess
import glob


conformances = "/mnt/c/Users/henri/Documents/TMF/GC_Schema_Generator/NewApproach/data/conformance/TMF669*.yaml"
for conformance in glob.glob(conformances):
    api = conformance.split('/')[-1].split('_')[0]
    print(conformance, api)
    rules = glob.glob("/mnt/c/Users/henri/Documents/TMF/Open_API_And_Data_Model/apis/"+api+"*/*.rules.yaml")[0]
    out_api = glob.glob('/mnt/c/Users/henri/Documents/TMF/OAS_Open_API_And_Data_Model/apis/'+api+"*/")[0]
    print("node", "rules2oas.js", "--input " + rules, "--schema-directory " + "/mnt/c/Users/henri/Documents/TMF/OAS_Open_API_And_Data_Model/schemas", "--api-target-directory", out_api, "--add-notification-examples", "--validate-properties", "--overwrite-events", "--overwrite-examples")
    subprocess.run(["node", "rules2oas", "--input ", rules, "--schema-directory ", "/mnt/c/Users/henri/Documents/TMF/OAS_Open_API_And_Data_Model/schemas", "--api-target-directory", out_api, "--add-notification-examples", "--validate-properties", "--overwrite-events", "--overwrite-examples"])