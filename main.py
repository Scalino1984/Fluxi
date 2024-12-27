import os
import sqlite3
import replicate
import argparse
import requests
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request, Form, Query
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
from asyncio import gather, Semaphore, create_task
from mistralai import Mistral
from dotenv import load_dotenv
from contextlib import contextmanager

load_dotenv()

HEADER = "\033[38;2;255;255;153m"
TITLE = "\033[38;2;255;255;153m"
MENU = "\033[38;2;255;165;0m"
SUCCESS = "\033[38;2;153;255;153m"
ERROR = "\033[38;2;255;69;0m"
MAIN = "\033[38;2;204;204;255m"
SPEAKER1 = "\033[38;2;173;216;230m"
SPEAKER2 = "\033[38;2;255;179;102m"
RESET = "\033[0m"

os.system("clear")

print(f"{HEADER}--------------------\nMY FLUX CREATOR v1.0\n--------------------{RESET}\n")

DOWNLOAD_DIR = "/mnt/d/ai/dialog/2/flux-pics"
DATABASE_PATH = "flux_logs.db"
TIMEOUT_DURATION = 900  # Timeout-Dauer in Sekunden

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/flux-pics", StaticFiles(directory=DOWNLOAD_DIR), name="flux-pics")
templates = Jinja2Templates(directory="templates")

@contextmanager
def get_db_connection(db_path=DATABASE_PATH):
    conn = sqlite3.connect(db_path)
    try:
        yield conn
    finally:
        conn.close()

def initialize_database(db_path=DATABASE_PATH):
    with get_db_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS generation_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                prompt TEXT,
                optimized_prompt TEXT,
                hf_lora TEXT,
                lora_scale REAL,
                aspect_ratio TEXT,
                guidance_scale REAL,
                output_quality INTEGER,
                prompt_strength REAL,
                num_inference_steps INTEGER,
                output_file TEXT,
                album_id INTEGER,
                category_id INTEGER
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS albums (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pictures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                file_path TEXT,
                file_name TEXT,
                album_id INTEGER,
                FOREIGN KEY (album_id) REFERENCES albums(id)
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS picture_categories (
                picture_id INTEGER,
                category_id INTEGER,
                FOREIGN KEY (picture_id) REFERENCES pictures(id),
                FOREIGN KEY (category_id) REFERENCES categories(id),
                PRIMARY KEY (picture_id, category_id)
            )
        """)
        conn.commit()

def log_generation(args, optimized_prompt, image_file):
    file_path, file_name = os.path.split(image_file)
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO generation_logs (
                    timestamp, prompt, optimized_prompt, hf_lora, lora_scale, aspect_ratio, guidance_scale,
                    output_quality, prompt_strength, num_inference_steps, output_file, album_id, category_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                args.prompt,
                optimized_prompt,
                args.hf_lora,
                args.lora_scale,
                args.aspect_ratio,
                args.guidance_scale,
                args.output_quality,
                args.prompt_strength,
                args.num_inference_steps,
                image_file,
                args.album_id,
                args.category_id
            ))
            picture_id = cursor.lastrowid
            cursor.execute("""
                INSERT INTO pictures (
                    timestamp, file_path, file_name, album_id
                ) VALUES (?, ?, ?, ?)
            """, (
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                file_path,
                file_name,
                args.album_id
            ))
            picture_id = cursor.lastrowid

            # Insert multiple categories
            for category_id in args.category_ids:
                cursor.execute("""
                    INSERT INTO picture_categories (picture_id, category_id)
                    VALUES (?, ?)
                """, (picture_id, category_id))

            conn.commit()
    except sqlite3.Error as e:
        print(f"Error logging generation: {e}")

@app.on_event("startup")
def startup_event():
    initialize_database()

@app.get("/")
def read_root(request: Request):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM albums")
        albums = cursor.fetchall()
        cursor.execute("SELECT id, name FROM categories")
        categories = cursor.fetchall()
    return templates.TemplateResponse("index.html", {"request": request, "albums": albums, "categories": categories})

@app.get("/archive")
def read_archive(
    request: Request,
    album: Optional[str] = Query(None),
    category: Optional[List[str]] = Query(None),
    search: Optional[str] = None,
    items_per_page: int = Query(30),
    page: int = Query(1)
):
    album_id = int(album) if album and album.isdigit() else None
    category_ids = [int(cat) for cat in category] if category else []
    offset = (page - 1) * items_per_page

    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT gl.timestamp, gl.prompt, gl.optimized_prompt, gl.output_file, a.name as album, c.name as category
            FROM generation_logs gl
            LEFT JOIN albums a ON gl.album_id = a.id
            LEFT JOIN categories c ON gl.category_id = c.id
            WHERE 1=1
        """
        params = []

        if album_id is not None:
            query += " AND gl.album_id = ?"
            params.append(album_id)

        if category_ids:
            query += " AND gl.category_id IN ({})".format(','.join('?' for _ in category_ids))
            params.extend(category_ids)

        if search:
            query += " AND (gl.prompt LIKE ? OR gl.optimized_prompt LIKE ?)"
            params.append(f'%{search}%')
            params.append(f'%{search}%')

        query += " ORDER BY gl.timestamp DESC LIMIT ? OFFSET ?"
        params.extend([items_per_page, offset])
        cursor.execute(query, params)
        logs = cursor.fetchall()

        logs = [{
            "timestamp": log[0],
            "prompt": log[1],
            "optimized_prompt": log[2],
            "output_file": log[3],
            "album": log[4],
            "category": log[5]
        } for log in logs]

        cursor.execute("SELECT id, name FROM albums")
        albums = cursor.fetchall()

        cursor.execute("SELECT id, name FROM categories")
        categories = cursor.fetchall()

    return templates.TemplateResponse("archive.html", {
        "request": request,
        "logs": logs,
        "albums": albums,
        "categories": categories,
        "selected_album": album,
        "selected_categories": category_ids,
        "search_query": search,
        "items_per_page": items_per_page,
        "page": page
    })

@app.get("/backend")
def read_backend(request: Request):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM albums")
        albums = cursor.fetchall()
        cursor.execute("SELECT id, name FROM categories")
        categories = cursor.fetchall()
    return templates.TemplateResponse("backend.html", {"request": request, "albums": albums, "categories": categories})

@app.post("/create_album")
def create_album(name: str = Form(...)):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO albums (name) VALUES (?)", (name,))
            conn.commit()
        return {"message": "Album erstellt"}
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Error creating album: {e}")

@app.post("/create_category")
def create_category(name: str = Form(...)):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("INSERT INTO categories (name) VALUES (?)", (name,))
            conn.commit()
        return {"message": "Kategorie erstellt"}
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Error creating category: {e}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        prompts = data.get("prompts", [data])

        for prompt_data in prompts:
            prompt_data['lora_scale'] = float(prompt_data['lora_scale'])
            prompt_data['guidance_scale'] = float(prompt_data['guidance_scale'])
            prompt_data['prompt_strength'] = float(prompt_data['prompt_strength'])
            prompt_data['num_inference_steps'] = int(prompt_data['num_inference_steps'])
            prompt_data['num_outputs'] = int(prompt_data['num_outputs'])
            prompt_data['output_quality'] = int(prompt_data['output_quality'])

            # Handle new album and category creation
            album_name = prompt_data.get('album_id')
            category_names = prompt_data.get('category_ids', [])

            if album_name and not album_name.isdigit():
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("INSERT INTO albums (name) VALUES (?)", (album_name,))
                    conn.commit()
                    prompt_data['album_id'] = cursor.lastrowid
            else:
                prompt_data['album_id'] = int(album_name) if album_name else None

            category_ids = []
            for category_name in category_names:
                if not category_name.isdigit():
                    with get_db_connection() as conn:
                        cursor = conn.cursor()
                        cursor.execute("INSERT INTO categories (name) VALUES (?)", (category_name,))
                        conn.commit()
                        category_ids.append(cursor.lastrowid)
                else:
                    category_ids.append(int(category_name) if category_name else None)
            prompt_data['category_ids'] = category_ids

            args = argparse.Namespace(**prompt_data)

            await websocket.send_json({"message": "Optimiere Prompt..."})
            optimized_prompt = optimize_prompt(args.prompt) if getattr(args, 'agent', False) else args.prompt
            await websocket.send_json({"optimized_prompt": optimized_prompt})

            if prompt_data.get("optimize_only"):
                continue

            await generate_and_download_image(websocket, args, optimized_prompt)
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        await websocket.send_json({"message": str(e)})
        raise e
    finally:
        await websocket.close()

async def fetch_image(item, index, args, filenames, semaphore, websocket, timestamp):
    async with semaphore:
        try:
            response = requests.get(item, timeout=TIMEOUT_DURATION)
            if response.status_code == 200:
                filename = f"{DOWNLOAD_DIR}/image_{timestamp}_{index}.{args.output_format}"
                with open(filename, "wb") as file:
                    file.write(response.content)
                filenames.append(f"/flux-pics/image_{timestamp}_{index}.{args.output_format}")
                progress = int((index + 1) / args.num_outputs * 100)
                await websocket.send_json({"progress": progress})
            else:
                await websocket.send_json({"message": f"Fehler beim Herunterladen des Bildes {index + 1}: {response.status_code}"})
        except requests.exceptions.Timeout:
            await websocket.send_json({"message": f"Timeout beim Herunterladen des Bildes {index + 1}"})

async def generate_and_download_image(websocket: WebSocket, args, optimized_prompt):
    try:
        input_data = {
            "prompt": optimized_prompt,
            "hf_lora": args.hf_lora,
            "lora_scale": args.lora_scale,
            "num_outputs": args.num_outputs,
            "aspect_ratio": args.aspect_ratio,
            "output_format": args.output_format,
            "guidance_scale": args.guidance_scale,
            "output_quality": args.output_quality,
            "prompt_strength": args.prompt_strength,
            "num_inference_steps": args.num_inference_steps,
            "disable_safety_checker": False
        }

        await websocket.send_json({"message": "Generiere Bilder..."})
        
        # Debug: Log the start of the replication process
        print(f"Starting replication process for {args.num_outputs} outputs with timeout {TIMEOUT_DURATION}")

        output = replicate.run(
            "lucataco/flux-dev-lora:091495765fa5ef2725a175a57b276ec30dc9d39c22d30410f2ede68a3eab66b3",
            input=input_data,
            timeout=TIMEOUT_DURATION
        )
        
        if not os.path.exists(DOWNLOAD_DIR):
            os.makedirs(DOWNLOAD_DIR)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filenames = []
        semaphore = Semaphore(3)  # Limit concurrent downloads

        tasks = [create_task(fetch_image(item, index, args, filenames, semaphore, websocket, timestamp)) for index, item in enumerate(output)]
        await gather(*tasks)

        for file in filenames:
            log_generation(args, optimized_prompt, file)
        
        await websocket.send_json({"message": "Bilder erfolgreich generiert", "generated_files": filenames})
    except requests.exceptions.Timeout:
        await websocket.send_json({"message": "Fehler bei der Bildgenerierung: Timeout überschritten"})
    except Exception as e:
        await websocket.send_json({"message": f"Fehler bei der Bildgenerierung: {str(e)}"})
        raise Exception(f"Fehler bei der Bildgenerierung: {str(e)}")

def optimize_prompt(prompt):
    api_key = os.environ.get("MISTRAL_API_KEY")
    agent_id = os.environ.get("MISTRAL_FLUX_AGENT")

    if not api_key or not agent_id:
        raise ValueError("MISTRAL_API_KEY oder MISTRAL_FLUX_AGENT nicht gesetzt")

    client = Mistral(api_key=api_key)
    chat_response = client.agents.complete(
        agent_id=agent_id,
        messages=[{"role": "user", "content": f"Optimiere folgenden Prompt für Flux Lora: {prompt}"}]
    )
    
    return chat_response.choices[0].message.content

class AssignRequest(BaseModel):
    albumId: Optional[int] = None
    categoryIds: Optional[List[int]] = []
    selectedImages: List[str]

@app.post("/assign_to_album")
async def assign_to_album(request: AssignRequest):
    try:
        with sqlite3.connect('flux_logs.db') as conn:
            cursor = conn.cursor()
            for image in request.selectedImages:
                cursor.execute("UPDATE pictures SET album_id = ? WHERE file_path = ?", (request.albumId, image))
            conn.commit()
        return {"message": "Bilder erfolgreich zugewiesen"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/assign_to_category")
async def assign_to_category(request: AssignRequest):
    try:
        with sqlite3.connect('flux_logs.db') as conn:
            cursor = conn.cursor()
            for image in request.selectedImages:
                cursor.execute("DELETE FROM picture_categories WHERE picture_id = (SELECT id FROM pictures WHERE file_path = ?)", (image,))
                for category_id in request.categoryIds:
                    cursor.execute("INSERT INTO picture_categories (picture_id, category_id) VALUES ((SELECT id FROM pictures WHERE file_path = ?), ?)", (image, category_id))
            conn.commit()
        return {"message": "Bilder erfolgreich zugewiesen"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)