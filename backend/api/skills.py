from fastapi import APIRouter
import subprocess
import re

router = APIRouter(prefix="/skills", tags=["skills"])


def parse_skills_list(output: str):
    """Parse the hermes skills list table output."""
    skills = []
    lines = output.strip().splitlines()
    
    # Find header line with separators (contains ┏, ┓, ━, etc.)
    header_idx = None
    for i, line in enumerate(lines):
        if '┏' in line or '┓' in line or '━' in line:
            header_idx = i
            break
    
    if header_idx is None:
        return skills
    
    # Data rows are after the header line + 1
    data_lines = lines[header_idx + 2:]
    
    for line in data_lines:
        # Skip separator lines
        if '┸' in line or '│' not in line:
            continue
        
        # Parse: │ name │ category │ source │ trust │
        parts = [p.strip() for p in line.split('│')]
        # parts[0] is empty, parts[1] is name, [2] category, [3] source, [4] trust, [5] empty
        if len(parts) >= 5 and parts[1]:
            name = parts[1].strip()
            if name and not name.startswith('─'):
                skills.append({
                    "name": name,
                    "category": parts[2].strip() if len(parts) > 2 else "",
                    "source": parts[3].strip() if len(parts) > 3 else "",
                    "trust": parts[4].strip() if len(parts) > 4 else ""
                })
    
    return skills


def get_skill_content(skill_name: str) -> str:
    """Get the SKILL.md content for a skill by inspecting it."""
    try:
        result = subprocess.run(
            ["hermes", "skills", "inspect", skill_name],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            return result.stdout
        return f"Could not load skill content: {result.stderr}"
    except Exception as e:
        return f"Error loading skill: {str(e)}"


@router.get("/")
async def list_skills():
    """List all installed skills from hermes CLI."""
    try:
        result = subprocess.run(
            ["hermes", "skills", "list"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return {"skills": [], "error": result.stderr}
        
        skills = parse_skills_list(result.stdout)
        return {"skills": skills}
    except Exception as e:
        return {"skills": [], "error": str(e)}


@router.get("/{skill_name}/content")
async def get_skill(skill_name: str):
    """Get the content/SKILL.md for a specific skill."""
    content = get_skill_content(skill_name)
    return {"name": skill_name, "content": content}
