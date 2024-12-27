let cropper;

function startCropper(imageElement) {
    if (cropper) {
        cropper.destroy();
    }
    cropper = new Cropper(imageElement, {
        aspectRatio: 1,
        viewMode: 1,
        autoCropArea: 1,
        responsive: true,
    });
}

function startGeneration() {
    const form = document.getElementById('generateForm');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }

    const progressBar = document.querySelector('.progress');
    progressBar.style.display = 'block';
    const progressBarInner = document.getElementById('progressBar');
    progressBarInner.style.width = '0%';
    progressBarInner.setAttribute('aria-valuenow', 0);

    const progressMessage = document.getElementById('progressMessage');
    progressMessage.style.display = 'block';

    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML = '';

    const formData = new FormData(form);
    const socket = new WebSocket('ws://localhost:8000/ws');

    socket.onopen = function () {
        socket.send(JSON.stringify(Object.fromEntries(formData)));
    };

    socket.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.optimized_prompt) {
            document.getElementById('prompt').value = data.optimized_prompt;
        }
        if (data.progress !== undefined) {
            progressBarInner.style.width = `${data.progress}%`;
            progressBarInner.setAttribute('aria-valuenow', data.progress);
        }
        if (data.message) {
            const message = document.createElement('div');
            message.textContent = data.message;
            outputDiv.appendChild(message);
        }
        if (data.generated_files) {
            data.generated_files.forEach(file => {
                const img = document.createElement('img');
                img.src = file;
                img.style.maxWidth = '100%';
                outputDiv.appendChild(img);
                const promptText = document.createElement('p');
                promptText.textContent = `Prompt: ${formData.get('prompt')}`;
                outputDiv.appendChild(promptText);
                const copyButton = document.createElement('button');
                copyButton.textContent = 'Copy Prompt';
                copyButton.className = 'btn btn-secondary mt-2';
                copyButton.onclick = function () { copyPrompt(formData.get('prompt')) };
                outputDiv.appendChild(copyButton);
                outputDiv.appendChild(document.createElement('br'));
            });
            progressBar.style.display = 'none';
            progressMessage.style.display = 'none';
        }
    };

    socket.onerror = function (event) {
        console.error('WebSocket error:', event);
    };

    socket.onclose = function (event) {
        console.log('WebSocket connection closed:', event);
    };
}

function optimizeOnly() {
    const form = document.getElementById('generateForm');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }

    const formData = new FormData(form);
    const socket = new WebSocket('ws://localhost:8000/ws');

    socket.onopen = function () {
        const data = Object.fromEntries(formData);
        data.optimize_only = true;
        socket.send(JSON.stringify(data));
    };

    socket.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.optimized_prompt) {
            document.getElementById('prompt').value = data.optimized_prompt;
        }
    };

    socket.onerror = function (event) {
        console.error('WebSocket error:', event);
    };

    socket.onclose = function (event) {
        console.log('WebSocket connection closed:', event);
    };
}

function batchOptimize() {
    // Prompts aus dem Textbereich sammeln
    const batchPrompts = document.getElementById('batchPrompts').value.split('\n').filter(prompt => prompt.trim() !== '');
    if (batchPrompts.length === 0) {
        alert("Bitte geben Sie mindestens einen Prompt ein.");
        return;
    }

    // Formulardaten sammeln
    const formData = new FormData(document.getElementById('generateForm'));
    const prompts = batchPrompts.map(prompt => {
        const data = Object.fromEntries(formData);
        data.prompt = prompt;
        return data;
    });

    // WebSocket-Verbindung öffnen
    const socket = new WebSocket('ws://localhost:8000/ws');

    socket.onopen = function () {
        // Prompts an den Server senden
        socket.send(JSON.stringify({ prompts }));
    };

    socket.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.optimized_prompt) {
            document.getElementById('prompt').value = data.optimized_prompt;
        }
        if (data.generated_files) {
            data.generated_files.forEach(file => {
                const livePreviewImage = document.getElementById('livePreviewImage');
                if (livePreviewImage) {
                    livePreviewImage.src = file;
                } else {
                    const img = document.createElement('img');
                    img.id = 'livePreviewImage';
                    img.src = file;
                    img.style.maxWidth = '100%';
                    document.getElementById('output').appendChild(img);
                }
            });
        }
    };

    socket.onerror = function (event) {
        console.error('WebSocket error:', event);
        alert('Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
    };

    socket.onclose = function (event) {
        console.log('WebSocket connection closed:', event);
    };
}

function copyPrompt() {
    const promptText = document.getElementById('prompt').value;
    navigator.clipboard.writeText(promptText).then(() => {
        alert('Prompt copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy prompt: ', err);
    });
}