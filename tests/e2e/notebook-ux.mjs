import assert from "node:assert/strict";

export async function checkNotebookUX(teacher, student) {
  const initialStudentSize = student.viewportSize();
  for (const width of [1920, 1100, 1500]) {
    await student.setViewportSize({ width, height: 900 });
    assert.equal(await student.locator('.notebook-header').getAttribute('data-compact'), 'true');
    await student.getByRole('radio', { name: 'Follow', exact: true }).waitFor();
    assert.equal(await student.locator('.header-more').isVisible(), true);
    assert.equal(await student.getByRole('group', { name: 'Class tools', exact: true }).isVisible(), false);
  }
  await student.setViewportSize(initialStudentSize);
  if (!(await teacher.getByRole("button", { name: "Settings", exact: true }).isVisible())) await teacher.locator(".header-more").click();
  await teacher.getByRole("button", { name: "Settings", exact: true }).click();
  await teacher.getByRole("dialog", { name: "Teacher settings" }).waitFor();
  await teacher.keyboard.press("Escape");
  const originalViewport = teacher.viewportSize();
  await teacher.setViewportSize({ width: 880, height: 1000 });
  await teacher.waitForFunction(() => getComputedStyle(document.querySelector(".teacher-dock")).position === "fixed");
  const rows = await teacher.locator(".teacher-dock .notebook-tool").evaluateAll((buttons) =>
    [...new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top)))]);
  assert.equal(rows.length, 1, "teacher tools use the scrolling dock before they stack");
  await teacher.setViewportSize(originalViewport);

  await teacher.getByRole("button", { name: "Shapes", exact: true }).click();
  const palette = teacher.getByRole("region", { name: "shapes", exact: true });
  await palette.waitFor();
  assert.equal(await palette.evaluate((element) => element.parentElement === document.body), true);
  assert.equal(await palette.evaluate((element) => getComputedStyle(element).animationName), "ink-pop-in");
  const box = await palette.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= teacher.viewportSize().width);
  await teacher.getByRole("button", { name: "Close shapes" }).click();
  assert.equal(await teacher.locator('#board-insert-panel').evaluate((element) => getComputedStyle(element).animationName), "ink-pop-out");
  await teacher.locator('#board-insert-panel').waitFor({ state: 'detached' });
  await teacher.getByRole("button", { name: "Templates", exact: true }).click();
  const templates = teacher.getByRole("region", { name: "templates", exact: true });
  await templates.waitFor();
  assert.equal(await templates.evaluate((element) => getComputedStyle(element).animationName), "ink-pop-in");
  await teacher.getByRole("button", { name: "Close templates" }).click();
  assert.equal(await teacher.locator('#board-insert-panel').evaluate((element) => getComputedStyle(element).animationName), "ink-pop-out");
  await teacher.locator('#board-insert-panel').waitFor({ state: 'detached' });

  // Seed an older topic-based notebook in this disposable guest context.
  const legacyTopic = await student.evaluate(() => {
    const code = location.pathname.split("/").at(-1);
    const room = JSON.parse(localStorage.getItem(`pacer:cache:${code}`));
    const topic = room.topics[0].id;
    const key = `pacer:student-notes:${code}:guest`;
    localStorage.setItem(key, JSON.stringify({ [topic]: "<p>Legacy class notes</p>" }));
    localStorage.removeItem(`${key}:sections`);
    return topic;
  });
  await student.reload();
  await student.getByRole("button", { name: /^Notebook page:/ }).click();
  await student.getByRole("group", { name: "Notebook page", exact: true }).getByRole("button").last().click();
  const notebook = student.getByRole("region", { name: "Your notes", exact: true });
  const widthGrip = notebook.getByRole("separator", { name: "Resize notebook" });
  const beforeWidth = Number(await widthGrip.getAttribute("aria-valuenow"));
  await widthGrip.press("ArrowLeft");
  assert.equal(Number(await widthGrip.getAttribute("aria-valuenow")), beforeWidth + 20);
  assert.equal(await notebook.locator(".nb-rich").first().innerText(), "Legacy class notes", "older topic notes remain accessible");
  await notebook.getByRole("button", { name: "+ New page", exact: true }).click();
  await student.getByText("New blank page. Edit its title below.", { exact: true }).waitFor();
  await notebook.getByRole("textbox", { name: "Page title" }).fill("Homework");
  const editor = notebook.locator(".nb-rich").first();
  await editor.fill("Formatting test");
  await notebook.getByRole("button", { name: "Previous notebook page", exact: true }).click();
  await notebook.locator(".nb-rich").filter({ hasText: "Legacy class notes" }).waitFor();
  await notebook.getByRole("button", { name: "Next notebook page", exact: true }).click();
  await notebook.locator(".nb-rich").filter({ hasText: "Formatting test" }).waitFor();
  for (const name of ["Bold", "Italic", "Underline", "Strikethrough"]) {
    await editor.click();
    await editor.press("ControlOrMeta+A");
    const toggle = notebook.getByRole("button", { name: new RegExp(`^${name} `) });
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "true", `${name} turns on`);
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "false", `${name} turns off`);
  }
  for (const name of ["Bulleted list", "Numbered list", "Checklist"]) {
    await editor.click();
    await editor.press("ControlOrMeta+A");
    const toggle = notebook.getByRole("button", { name: new RegExp(`^${name} `) });
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "true", `${name} turns on`);
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "false", `${name} turns off`);
  }
  await notebook.getByRole("button", { name: /^Text style:/ }).click();
  await notebook.getByRole("menuitemradio", { name: "Heading", exact: true }).click();
  assert.equal(await editor.locator("h3").count(), 1, "heading applies to the selected editor");
  await notebook.getByRole("button", { name: /^Text style:/ }).click();
  await notebook.getByRole("menuitemradio", { name: "Normal text", exact: true }).click();
  await notebook.getByRole("button", { name: "Align", exact: true }).click();
  await notebook.getByRole("menuitemradio", { name: "Align center", exact: true }).click();
  await notebook.getByRole("button", { name: "Align", exact: true }).click();
  await notebook.getByRole("menuitemradio", { name: "Align left", exact: true }).click();
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await notebook.getByRole("button", { name: /^Link \(/ }).click();
  await notebook.getByRole("textbox", { name: "Link address" }).fill("https://example.com");
  await notebook.getByRole("button", { name: "Apply", exact: true }).click();
  assert.equal(await editor.locator("a").getAttribute("href"), "https://example.com");
  await notebook.getByRole("button", { name: /^Link \(/ }).click();
  await notebook.getByRole("button", { name: "Remove", exact: true }).click();
  assert.equal(await editor.locator("a").count(), 0);
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await notebook.getByRole("button", { name: "Text color", exact: true }).click();
  await notebook.getByRole("menuitem", { name: "Blue", exact: true }).click();
  assert.equal(await editor.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode();
    return getComputedStyle(text.parentElement).color;
  }), "rgb(29, 78, 216)");
  await notebook.getByRole("button", { name: "Highlight color", exact: true }).click();
  await notebook.getByRole("menuitem", { name: "Yellow highlight", exact: true }).click();
  await notebook.getByRole("button", { name: "Clear formatting", exact: true }).click();
  await student.reload();
  await student.getByRole("button", { name: /^Notebook page:/ }).click();
  await student.getByRole("group", { name: "Notebook page", exact: true }).getByRole("button", { name: "Homework", exact: true }).click();
  await notebook.locator(".nb-rich").filter({ hasText: "Formatting test" }).waitFor();
  assert.equal(await editor.innerText(), "Formatting test");
  await notebook.getByRole("button", { name: "Expand notebook" }).click();
  await student.locator('.nb[data-expanded="true"]').waitFor();
  assert.equal(await notebook.getAttribute("data-expanded"), "true");
  await notebook.getByRole("radio", { name: "Write", exact: true }).click();
  const canvas = notebook.locator(".nb-ink-page canvas");
  await canvas.waitFor();
  const paper = await canvas.boundingBox();
  assert.ok(paper.width >= 700 && paper.height >= paper.width, "writing page has room for handwriting");
  await notebook.getByRole("button", { name: /^Writing page zoom:/ }).click();
  await student.getByRole("group", { name: "Writing page zoom", exact: true }).getByRole("button", { name: "150%", exact: true }).click();
  await student.waitForFunction(() => !document.documentElement.hasAttribute("data-view-transition"));
  assert.ok((await canvas.boundingBox()).width > paper.width, "writing page zoom enlarges the paper");
  await student.keyboard.press("Escape");
  await student.locator(".nb:not([data-expanded])").waitFor();
  assert.equal(await notebook.getAttribute("data-expanded"), null);
  await notebook.getByRole("button", { name: /^Writing page zoom:/ }).click();
  await student.getByRole("group", { name: "Writing page zoom", exact: true }).getByRole("button", { name: "100%", exact: true }).click();
  await notebook.getByRole("button", { name: "Expand notebook" }).click();
  await student.locator('.nb[data-expanded="true"]').waitFor();
  await student.keyboard.press("Escape");
  await student.locator(".nb:not([data-expanded])").waitFor();

  await student.locator("[data-block-id]").first().click();
  const companion = student.getByRole("complementary", { name: "AI companion" });
  await companion.waitFor();
  assert.equal(await companion.evaluate((element) => getComputedStyle(element).animationName), 'companion-in');
  assert.equal(await companion.getByRole('button', { name: 'Why this step?', exact: true }).count(), 0, 'secondary actions stay tucked away');
  await companion.getByRole('button', { name: /^More actions:/ }).click();
  await student.getByRole('group', { name: 'More actions', exact: true }).getByRole('button', { name: 'Why this step?', exact: true }).waitFor();
  await student.keyboard.press('Escape');
  await companion.getByRole('button', { name: /^Tools:/ }).click();
  for (const label of ['Explain in depth', 'Graph it', 'Visualize it', 'Quiz me']) {
    await student.getByRole('group', { name: 'Tools', exact: true }).getByRole('button', { name: new RegExp(`^${label}`) }).waitFor();
  }
  await student.keyboard.press('Escape');
  const before = await companion.boundingBox();
  await companion.getByRole("button", { name: "Move AI panel", exact: true }).press("ArrowLeft");
  const after = await companion.boundingBox();
  assert.ok(after.x < before.x, "snip popup moves");
  assert.equal(await companion.evaluate((element) => element.parentElement === document.body), true, "snip escapes board stacking contexts");
  await companion.getByRole("button", { name: "Resize AI panel", exact: true }).press("ArrowRight");
  assert.ok((await companion.boundingBox()).width > before.width, "snip popup resizes from its corner");
  const resized = await companion.boundingBox();
  const grip = await companion.getByRole("button", { name: "Resize AI panel", exact: true }).boundingBox();
  await student.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await student.mouse.down();
  await student.mouse.move(grip.x + grip.width / 2 + 50, grip.y + grip.height / 2 + 40);
  await student.mouse.up();
  assert.ok((await companion.boundingBox()).width >= resized.width + 45, "corner drag chooses a custom panel size");
  assert.equal(await companion.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + 10, box.y + 10));
  }), true, "snip stays above the classroom");
  await companion.getByRole('textbox', { name: 'Ask a question', exact: true }).fill('Keep this draft while resizing');
  for (const size of [{ width: 300, height: 240 }, { width: 600, height: 500 }]) {
    const bounds = await companion.boundingBox();
    const corner = await companion.getByRole('button', { name: 'Resize AI panel', exact: true }).boundingBox();
    await student.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
    await student.mouse.down();
    await student.mouse.move(corner.x + corner.width / 2 + size.width - bounds.width, corner.y + corner.height / 2 + size.height - bounds.height);
    await student.mouse.up();
    assert.equal(await companion.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return [...element.children].every((child) => {
        const rect = child.getBoundingClientRect();
        return rect.bottom <= box.bottom + 1 && rect.right <= box.right + 1;
      }) && element.scrollWidth <= element.clientWidth;
    }), true, 'resized panel contains its scrolling content and resize handle');
    assert.equal(await companion.getByRole('textbox', { name: 'Ask a question', exact: true }).inputValue(), 'Keep this draft while resizing');
  }
  await companion.getByRole("button", { name: "Close AI panel" }).click();
  assert.equal(await student.locator('.ai-companion').evaluate((element) => getComputedStyle(element).animationName), 'companion-out');
  await student.locator('.ai-companion').waitFor({ state: 'detached' });

  // Two disposable slide fixtures: the student browses slide 1 while the teacher is on slide 2.
  await teacher.evaluate(() => {
    const code = location.pathname.split("/").at(-1);
    const key = `pacer:room:${code}`;
    const room = JSON.parse(localStorage.getItem(key));
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 450;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 800, 450);
    ctx.fillStyle = "black"; ctx.font = "32px sans-serif"; ctx.fillText("Selected slide fixture", 30, 80);
    const sharedUrl = canvas.toDataURL("image/png");
    room.slides = { id: "slide-question-fixture", name: "Test deck", total: 2, current: 2, access: "all", presented: [1, 2], ink: {
      1: [{ id: "fixture-ink", pts: [[0, .5], [1, .5]], color: "#ff0000", width: 40 }],
    }, pages: {
      1: { id: "fixture-slide-1", width: 800, height: 450, text: "Only slide one: probability density.", sharedUrl },
      2: { id: "fixture-slide-2", width: 800, height: 450, text: "Only slide two: unrelated algebra.", sharedUrl },
    } };
    room.showSlides = true; room.splitView = true;
    localStorage.setItem(key, JSON.stringify(room));
  });
  await teacher.reload();
  await teacher.getByText("Slide 2 of 2", { exact: true }).waitFor();
  const desktopSize = teacher.viewportSize();
  for (const viewport of [{ width: 686, height: 763 }, { width: 1500, height: 900 }]) {
    await teacher.setViewportSize(viewport);
    await teacher.waitForFunction(() => [...document.querySelectorAll('.notebook-thumbnail')].every((element) => element.getBoundingClientRect().width <= 160));
    const tray = await teacher.locator('.notebook-pages').boundingBox();
    if (viewport.width < 1024) assert.ok(tray.height < 180, "Pages stays a compact strip in half-screen layouts");
    else assert.ok(tray.width <= 180, "Pages stays a narrow sidebar on desktop");
  }
  await teacher.setViewportSize(desktopSize);
  await student.reload();
  const studentSize = student.viewportSize();
  for (const width of [1024, 1100, 1200, 1280, 1400, 1500]) {
    await student.setViewportSize({ width, height: 900 });
    await student.waitForFunction(() => {
      const toggle = document.querySelector('.board-split-arrange')?.getBoundingClientRect();
      const ask = [...document.querySelectorAll('.slide-controls button')].find((button) => button.textContent === 'Ask about this slide')?.getBoundingClientRect();
      return toggle && ask && (ask.right <= toggle.left || ask.bottom <= toggle.top || ask.top >= toggle.bottom || ask.left >= toggle.right);
    });
  }
  await student.setViewportSize(studentSize);
  await student.getByRole("button", { name: "Previous slide", exact: true }).click();
  await student.getByText("Slide 1 of 2", { exact: true }).waitFor();
  await student.locator('img[alt="Lecture slide"]').waitFor();
  await student.waitForFunction(() => document.querySelector('img[alt="Lecture slide"]')?.naturalWidth > 0);
  await student.getByRole("button", { name: "Ask about this slide", exact: true }).click();
  await companion.getByText("Test deck · Slide 1", { exact: true }).waitFor();
  assert.ok((await companion.innerText()).includes("Selected slide only"));
  assert.ok(!(await companion.innerText()).includes("handwriting"));
  await companion.getByRole("textbox", { name: "Ask a question", exact: true }).fill("Explain the selected slide");
  // Focusing the other split pane must preserve the open question and its draft.
  await student.getByRole("region", { name: "Whiteboard", exact: true }).first().click({ position: { x: 10, y: 10 } });
  assert.equal(await companion.getByRole("textbox", { name: "Ask a question", exact: true }).inputValue(), "Explain the selected slide");
  let requestBody;
  await student.route("**/api/ai", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ json: { text: "Selected slide answer\n\n" + "A long explanation that students can read by scrolling their conversation.\n\n".repeat(40), source: "demo" } });
  });
  await companion.getByRole("button", { name: "Ask", exact: true }).click();
  await companion.getByText(/^Selected slide answer/).waitFor();
  await companion.locator('.ai-companion-content').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  assert.equal(await companion.evaluate((element) => {
    const root = element.getBoundingClientRect();
    const close = element.querySelector('[aria-label="Close AI panel"]').getBoundingClientRect();
    const question = element.querySelector('#ask-q').getBoundingClientRect();
    return element.scrollTop === 0 && close.top >= root.top && close.bottom <= root.bottom && question.top >= root.top && question.bottom <= root.bottom;
  }), true, 'long answers keep Close and the question field visible without scrolling the outer panel');
  assert.equal(requestBody.slide, true);
  assert.deepEqual(requestBody.selected, ["Only slide one: probability density."]);
  assert.deepEqual(requestBody.context, []);
  assert.equal(requestBody.topicTitle, "Test deck · Slide 1");
  assert.ok(requestBody.image.startsWith("data:image/"));
  const pixel = await student.evaluate(async (source) => {
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data);
  }, requestBody.image);
  assert.ok(pixel[0] > 240 && pixel[1] > 240 && pixel[2] > 240, "whole-slide questions exclude red ink overlays");
  await student.unroute("**/api/ai");
  await companion.getByRole("button", { name: "Close AI panel" }).click();
}
