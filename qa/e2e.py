"""End-to-end test of Gallery 01 in a real browser (WebGL via SwiftShader)."""
import asyncio, sys, math, json
from playwright.async_api import async_playwright
URL = 'http://127.0.0.1:5181/'
OUT = '/home/claude/curator/qa/'
fails = 0
def ok(c, m):
    global fails; print(('PASS ' if c else 'FAIL ') + m, flush=True); fails += 0 if c else 1
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": 1280, "height": 800})
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append("PAGE " + str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        S = lambda js: pg.evaluate(js)
        st = "window.__curator.getState()"
        await pg.goto(URL); await pg.wait_for_function("document.querySelector('.loading') === null", timeout=120000)
        await pg.wait_for_timeout(4000)
        await pg.screenshot(path=OUT + "01_title.png")
        ok(await pg.get_by_role("button", name="New Journey").count() == 1, "title screen offers New Journey")
        await pg.get_by_role("button", name="New Journey").click(); await pg.wait_for_timeout(9000)
        await pg.screenshot(path=OUT + "02_arrival.png")
        ok(await S(st + ".screen") == "game", "entered Gallery 01")
        ok(await S(st + ".progress.blades.length") == 3, "three movable sculptures present")
        # ---- a real alignment with the mouse and keyboard
        t = await S("(() => { const s = " + st + "; return { b: s.progress.blades[0] } })()")
        tgt = await pg.evaluate("""() => { const s = window.__curator.getState(); const k = s.progress.filled.findIndex((f, i) => !f && Math.floor(i / 3) === s.progress.composition); return window.__curatorSlot(k) }""")
        b0 = t['b']
        sx, sy = await pg.evaluate("([x, z]) => window.__curatorProject(x, 0.03, z)", [b0['x'], b0['z']])
        await pg.mouse.click(sx, sy); await pg.wait_for_timeout(600)
        ok(await S(st + ".selected") == 0, "clicking a sculpture selects it")
        await pg.screenshot(path=OUT + "03_selected.png")
        ex, ey = await pg.evaluate("([x, z]) => window.__curatorProject(x, 0.03, z)", [tgt['x'], tgt['z']])
        await pg.mouse.move(sx, sy); await pg.mouse.down()
        for i in range(1, 25):
            await pg.mouse.move(sx + (ex - sx) * i / 24, sy + (ey - sy) * i / 24); await pg.wait_for_timeout(40)
        await pg.screenshot(path=OUT + "04_dragging.png")
        await pg.mouse.up(); await pg.wait_for_timeout(500)
        b1 = await S(st + ".progress.blades[0]")
        moved = math.hypot(b1['x'] - b0['x'], b1['z'] - b0['z'])
        ok(moved > 1.0, f"dragging moves the sculpture across the floor ({moved:.2f} m)")
        ok(math.hypot(b1['x'] - tgt['x'], b1['z'] - tgt['z']) < 0.25, f"drag lands near the target ({math.hypot(b1['x'] - tgt['x'], b1['z'] - tgt['z']):.3f} m)")
        # turn with Q/E toward the target orientation
        for _ in range(80):
            b1 = await S(st + ".progress.blades[0]")
            if b1['slot'] is not None: break
            d = math.atan2(math.sin(tgt['yaw'] - b1['yaw']), math.cos(tgt['yaw'] - b1['yaw']))
            if abs(d) > math.radians(4): await pg.keyboard.press('q' if d > 0 else 'e')
            elif abs(d) > math.radians(0.8): await pg.keyboard.press('Shift+Q' if d > 0 else 'Shift+E')
            else:
                dx, dz = tgt['x'] - b1['x'], tgt['z'] - b1['z']
                if abs(dx) > abs(dz): await pg.keyboard.press(('Shift+' if abs(dx) < 0.06 else '') + ('ArrowRight' if dx > 0 else 'ArrowLeft'))
                else: await pg.keyboard.press(('Shift+' if abs(dz) < 0.06 else '') + ('ArrowDown' if dz > 0 else 'ArrowUp'))
            await pg.wait_for_timeout(60)
        await pg.wait_for_timeout(900)
        ok(await S("window.__curator.getState().progress.filled.filter(Boolean).length") == 1, "the sculpture locks once its shadow lies on the etched circle (1/15)")
        await pg.screenshot(path=OUT + "05_first_alignment.png")
        # ---- persistence
        await pg.reload(); await pg.wait_for_function("document.querySelector('.loading') === null", timeout=120000); await pg.wait_for_timeout(2500)
        ok(await pg.get_by_role("button", name="Continue").count() == 1, "after a reload the title offers Continue")
        await pg.get_by_role("button", name="Continue").click(); await pg.wait_for_timeout(5000)
        ok(await S("window.__curator.getState().progress.filled.filter(Boolean).length") == 1, "progress survives a page reload")
        # ---- tools: hint stages, align and plan views, pause
        for h in (1, 2, 3): await pg.keyboard.press('h')
        await pg.wait_for_timeout(1500); ok(await S(st + ".hint") == 3, "three-stage hint reachable")
        await pg.screenshot(path=OUT + "06_hint3.png")
        await pg.keyboard.press('h'); await pg.keyboard.press('v'); await pg.wait_for_timeout(5000)
        await pg.screenshot(path=OUT + "07_align_view.png")
        await pg.keyboard.press('p'); await pg.wait_for_timeout(6000)
        await pg.screenshot(path=OUT + "08_plan_view.png")
        await pg.keyboard.press('p'); await pg.wait_for_timeout(500)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(800)
        ok(await pg.get_by_text("Restart composition").count() == 1, "pause menu opens")
        await pg.screenshot(path=OUT + "09_pause.png")
        await S(st + ".setPaused(false)"); await pg.wait_for_timeout(400)
        # ---- solve the rest through the debug hook (same lock path as the player's) and finish the gallery
        shot = False
        for _ in range(200):
            if await S(st + ".progress.complete"): break
            did = await S("window.__curator.getState().debugSolveNext()")
            n = await S("window.__curator.getState().progress.filled.filter(Boolean).length")
            if n == 3 and not shot: await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT + "10_composition_complete.png"); shot = True
            await pg.wait_for_timeout(400 if did else 900)
        await pg.wait_for_timeout(3500)
        ok(await S(st + ".progress.complete") is True, "all 15 alignments complete the gallery")
        await pg.screenshot(path=OUT + "11_reveal.png")
        await pg.wait_for_timeout(5000)
        ok(await S(st + ".doorOpen") is True, "completion opens the hidden doorway")
        await pg.screenshot(path=OUT + "12_door_open.png")
        await pg.wait_for_timeout(9000)
        await pg.screenshot(path=OUT + "13_next_gallery.png")
        ok(2 in await S(st + ".save.unlocked"), "Gallery 02 is unlocked")
        await S("window.__curator.getState().go('atlas')"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + "14_atlas.png", full_page=False)
        ok(await pg.get_by_text("in preparation").count() >= 1, "atlas shows Gallery 02 as unlocked / in preparation")
        real = [e for e in errs if 'GPU stall' not in e and 'GL Driver' not in e]
        ok(not real, "no console errors" + ("" if not real else ": " + " | ".join(real[:5])))
        await b.close()
    print("FAILS", fails)
asyncio.run(main())
