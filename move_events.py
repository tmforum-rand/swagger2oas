import glob
import re
from pathlib import Path
import os


ooadm = "/mnt/c/Users/henri/Documents/TMF/OAS_Open_API_And_Data_Model/"
old_oadm = '/mnt/c/Users/henri/Documents/TMF/Open_API_And_Data_Model/'

for event_schema in glob.glob(ooadm + "schemas/Tmf/schemas/Event/*"):
    found = False
    schema_word_array = re.findall('[a-zA-Z][^A-Z]*', event_schema.split('/')[-1].replace('.schema.json',''))
    #print(schema_word_array[::-1])
    for i in range(len(schema_word_array)):
        cropped_schema_name = schema_word_array[-i-1::-1]
        cropped_str = "".join(cropped_schema_name[::-1])
        glo_schema = glob.glob(old_oadm + 'schemas/*/'+cropped_str+'.schema.json')
        print(cropped_str)
        if len(glo_schema) > 0:
            print(glo_schema)
            glo_schema_ooadm = glo_schema[0].replace(old_oadm,ooadm)
            events_folder = ("/".join(glo_schema_ooadm.split('/')[:-1])+"/Event/").replace('/schemas/','/schemas/Tmf/')
            print(events_folder)
            
            Path(events_folder).mkdir(parents=True, exist_ok=True)
            print(event_schema, events_folder+event_schema.split('/')[-1])
            os.replace(event_schema, events_folder+event_schema.split('/')[-1])
            break

for payload_schema in glob.glob(ooadm + "schemas/Tmf/schemas/*.schema.json"):
    schema_word_array = re.findall('[a-zA-Z][^A-Z]*', payload_schema.split('/')[-1].replace('.schema.json',''))
    #print(schema_word_array[::-1])
    for i in range(len(schema_word_array)):
        cropped_schema_name = schema_word_array[-i-1::-1]
        cropped_str = "".join(cropped_schema_name[::-1])
        glo_schema = glob.glob(old_oadm + 'schemas/*/'+cropped_str+'.schema.json')
        #print(cropped_str)
        if len(glo_schema) > 0:
            print(glo_schema)
            glo_schema_ooadm = glo_schema[0].replace(old_oadm,ooadm)
            events_folder = ("/".join(glo_schema_ooadm.split('/')[:-1])+"/Event/").replace('/schemas/','/schemas/Tmf/')
            print(events_folder)
            
            Path(events_folder).mkdir(parents=True, exist_ok=True)
            print(payload_schema, events_folder+payload_schema.split('/')[-1])
            os.replace(payload_schema, events_folder+payload_schema.split('/')[-1])
            break