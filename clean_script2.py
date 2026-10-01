import sys

def main():
    with open("script.js", "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    with open("script_cleaned.js", "w", encoding="utf-8") as f:
        skip_mode = False
        for i, line in enumerate(lines):
            if "let contentEl = document.getElementById(section.startsWith('saju')" in line:
                f.write("    let contentEl = document.getElementById(`${section}-content`);\n")
                continue
                
            if "if (section === 'saju_analysis') {" in line:
                skip_mode = True
                continue
                
            if skip_mode:
                if "        // 이모지 등 특수 기호 완벽 제거" in line or "        //" in line and "이모지" in line:
                    skip_mode = False
                    f.write(line)
                continue
            
            f.write(line)

if __name__ == "__main__":
    main()
