import glob
from pathlib import Path
import shutil


ooadm = "/mnt/c/Users/henri/Documents/TMF/OAS_Open_API_And_Data_Model/"
old_oadm = '/mnt/c/Users/henri/Documents/TMF/Open_API_And_Data_Model/'


for operation_samples in glob.glob(old_oadm+'apis/*/documentation/operation-samples/*.sample.json'):
    new_operation_samples = operation_samples.replace(old_oadm,ooadm)
    print("/".join(new_operation_samples.split('/')[:-1]))
    Path("/".join(new_operation_samples.split('/')[:-1])).mkdir(parents=True, exist_ok=True)
    print(operation_samples, new_operation_samples)
    shutil.copyfile(operation_samples, new_operation_samples)

for resource_samples in glob.glob(old_oadm+'apis/*/documentation/resource-samples/*.example.json'):
    new_resource_samples = resource_samples.replace(old_oadm,ooadm)
    print("/".join(new_resource_samples.split('/')[:-1]))
    Path("/".join(new_resource_samples.split('/')[:-1])).mkdir(parents=True, exist_ok=True)
    print(resource_samples, new_resource_samples)
    shutil.copyfile(resource_samples, new_resource_samples)