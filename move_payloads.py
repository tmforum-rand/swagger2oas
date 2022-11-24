import glob
import os


ooadm = "/mnt/c/Users/henri/Documents/TMF/OAS_Open_API_And_Data_Model/"

for payload in glob.glob(ooadm+'schemas/Tmf/*/*Payload.schema.json'):
    print(payload)
    #os.replace(payload,payload.replace('')