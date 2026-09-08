import fitz

def wrap_text(text: str, fontname: str, fontsize: float, max_width: float) -> list[str]:
    words = text.split(' ')
    lines = []
    current_line = []
    for word in words:
        if not word:
            continue
        test_line = ' '.join(current_line + [word]) if current_line else word
        width = fitz.get_text_length(test_line, fontname=fontname, fontsize=fontsize)
        if width <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(' '.join(current_line))
            current_line = [word]
    if current_line:
        lines.append(' '.join(current_line))
    return lines

def generate_jd_pdf(title: str, content: str) -> bytes:
    doc = fitz.open()

    margin = 54
    page_width = 595.0
    page_height = 842.0
    printable_width = page_width - 2 * margin
    bottom_limit = page_height - margin

    def create_page():
        page = doc.new_page(width=page_width, height=page_height)
        if len(doc) > 1:
            page.insert_text(fitz.Point(margin, margin - 15), "Job Description - " + title, fontname="helv", fontsize=8, color=(0.5, 0.5, 0.5))
            page.draw_line(fitz.Point(margin, margin - 10), fitz.Point(page_width - margin, margin - 10), color=(0.8, 0.8, 0.8), width=0.5)
        return page

    page = create_page()
    y = margin + 20

    # Document Header
    page.insert_text(fitz.Point(margin, y), "JOB DESCRIPTION", fontname="hebo", fontsize=24, color=(0.12, 0.35, 0.6))
    y += 10
    page.draw_line(fitz.Point(margin, y), fitz.Point(page_width - margin, y), color=(0.12, 0.35, 0.6), width=2)
    y += 25

    # Job Title Banner
    page.insert_text(fitz.Point(margin, y), "Position Title:", fontname="hebo", fontsize=11, color=(0.4, 0.4, 0.4))
    y += 18
    title_lines = wrap_text(title, "hebo", 16, printable_width)
    for t_line in title_lines:
        page.insert_text(fitz.Point(margin, y), t_line, fontname="hebo", fontsize=16, color=(0.1, 0.1, 0.1))
        y += 22
    y += 10

    # Content Paragraphs
    paragraphs = content.split('\n')

    HEADINGS = {
        "job summary", "job description", "summary", "responsibilities", "key responsibilities",
        "duties", "key duties", "required skills", "required qualifications", "skills",
        "qualifications", "skills & qualifications", "skills and qualifications",
        "required skills & qualifications", "preferred skills", "preferred qualifications",
        "education", "experience", "employment type", "location", "benefits", "about us",
        "company description", "requirements", "job requirements"
    }

    def is_heading(line: str) -> bool:
        clean = line.strip().lower().rstrip(':')
        if clean in HEADINGS:
            return True
        if len(line.strip()) < 50 and line.strip().endswith(':'):
            return True
        return False

    for para in paragraphs:
        para_stripped = para.strip()
        if not para_stripped:
            y += 8
            continue

        if is_heading(para_stripped):
            heading_text = para_stripped.rstrip(':')
            y += 15
            if y + 30 > bottom_limit:
                page = create_page()
                y = margin + 20

            page.insert_text(fitz.Point(margin, y), heading_text, fontname="hebo", fontsize=12, color=(0.12, 0.35, 0.6))
            y += 4
            page.draw_line(fitz.Point(margin, y), fitz.Point(margin + 40, y), color=(0.12, 0.35, 0.6), width=1.5)
            y += 14
            continue

        is_bullet = False
        bullet_char = ""
        bullet_indent = 15
        text_to_wrap = para_stripped

        for prefix in ["* ", "- ", "• "]:
            if para_stripped.startswith(prefix):
                is_bullet = True
                bullet_char = prefix[0]
                text_to_wrap = para_stripped[len(prefix):]
                break

        if not is_bullet:
            parts = para_stripped.split(' ', 1)
            if len(parts) > 1:
                first_word = parts[0]
                if (first_word.endswith('.') or first_word.endswith(')')) and first_word[:-1].isdigit():
                    is_bullet = True
                    bullet_char = first_word
                    text_to_wrap = parts[1]
                    bullet_indent = 22

        current_margin = margin + bullet_indent if is_bullet else margin
        current_width = printable_width - bullet_indent if is_bullet else printable_width

        wrapped_lines = wrap_text(text_to_wrap, "helv", 10, current_width)

        for i, line in enumerate(wrapped_lines):
            if y + 14 > bottom_limit:
                page = create_page()
                y = margin + 20

            if i == 0 and is_bullet:
                bullet_x = margin + 2 if bullet_char in ["*", "-", "•"] else margin
                page.insert_text(fitz.Point(bullet_x, y), bullet_char, fontname="hebo", fontsize=10, color=(0.12, 0.35, 0.6))

            page.insert_text(fitz.Point(current_margin, y), line, fontname="helv", fontsize=10, color=(0.2, 0.2, 0.2))
            y += 14

        y += 4

    for i, page_obj in enumerate(doc):
        page_num_str = f"Page {i+1} of {len(doc)}"
        page_obj.insert_text(
            fitz.Point(page_width - margin - 60, page_height - 30),
            page_num_str,
            fontname="helv",
            fontsize=8,
            color=(0.5, 0.5, 0.5)
        )

    return doc.write()
