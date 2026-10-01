import re

with open('iching_data.js', 'r', encoding='utf-8') as f:
    text = f.read()

def process_json_string(s):
    # s is the string value, e.g., '蒙, 亨. 匪我求童蒙 童蒙求我.'
    return re.sub(r'([^\s,\.\?!，。])\s+([^\s])', r'\1, \2', s)

def replace_in_line(line):
    if '"gwaesa_chinese":' in line or '"text_chinese":' in line:
        parts = line.split('"', 3)
        if len(parts) >= 4:
            key = parts[1]
            val = parts[3].rsplit('"', 1)
            if len(val) == 2:
                new_val = process_json_string(val[0])
                return parts[0] + '"' + key + '"' + parts[2] + '"' + new_val + '"' + val[1]
    return line

new_lines = []
for line in text.splitlines(True):
    new_lines.append(replace_in_line(line))

with open('iching_data.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
