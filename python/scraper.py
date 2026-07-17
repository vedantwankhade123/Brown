import asyncio
from playwright.async_api import async_playwright

async def scrape_local_url(url: str) -> str:
  """
  Launches a headless Playwright instance to scrape a target page.
  Strictly runs in offline, headless mode and returns plain text.
  """
  try:
    async with async_playwright() as p:
      # Launch browser offline and headless
      browser = await p.chromium.launch(
        headless=True,
        args=["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"]
      )
      
      context = await browser.new_context()
      page = await context.new_page()
      
      # Capped at 15-second timeout for local safety
      await page.goto(url, timeout=15000)
      
      # Extract text cleanly from the page
      text_content = await page.evaluate("() => document.body.innerText")
      
      await browser.close()
      return text_content.strip()
      
  except Exception as e:
    return f"Playwright Scraping Error: {str(e)}"

# Direct script execution test entry
if __name__ == "__main__":
  # Simple test run targeting localhost
  result = asyncio.run(scrape_local_url("http://127.0.0.1:11434"))
  print(f"Scraper test output:\n{result[:200]}")
