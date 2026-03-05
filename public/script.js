document.addEventListener('DOMContentLoaded', () => {
    // Set current year in footer
    document.getElementById('current-year').textContent = new Date().getFullYear();

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    const progressContainer = document.getElementById('upload-progress-container');
    const fileNameDisplay = document.getElementById('file-name-display');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');

    const resultContainer = document.getElementById('result-container');
    const downloadLinkInput = document.getElementById('download-link');
    const copyBtn = document.getElementById('copy-btn');
    const uploadAnotherBtn = document.getElementById('upload-another-btn');

    const errorContainer = document.getElementById('error-container');
    const errorMessage = document.getElementById('error-message');
    const retryBtn = document.getElementById('retry-btn');

    const expirationSelect = document.getElementById('expiration-select');
    const expirationNote = document.getElementById('expiration-note');
    const resultExpirationText = document.getElementById('result-expiration-text');

    // Update note when expiration option changes
    expirationSelect.addEventListener('change', () => {
        const val = expirationSelect.value;
        if (val === 'permanent') {
            expirationNote.innerHTML = '<i class="fa-solid fa-infinity"></i> سيتم حفظ هذا الملف بشكل دائم.';
        } else if (val === '1') {
            expirationNote.innerHTML = '<i class="fa-solid fa-circle-info"></i> سيتم حذف الملف تلقائياً بعد 24 ساعة';
        } else if (val === '7') {
            expirationNote.innerHTML = '<i class="fa-solid fa-circle-info"></i> سيتم حذف الملف تلقائياً بعد 7 أيام';
        } else if (val === '30') {
            expirationNote.innerHTML = '<i class="fa-solid fa-circle-info"></i> سيتم حذف الملف تلقائياً بعد 30 يوماً';
        }
    });

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropZone.classList.add('dragover');
    }

    function unhighlight(e) {
        dropZone.classList.remove('dragover');
    }

    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    // Handle selected files
    fileInput.addEventListener('change', function () {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length === 0) return;

        // We only handle single file upload at a time for this UI
        const file = files[0];
        uploadFile(file);
    }

    function uploadFile(file) {
        // Hide other containers, show progress
        dropZone.classList.add('hidden');
        resultContainer.classList.add('hidden');
        errorContainer.classList.add('hidden');
        progressContainer.classList.remove('hidden');

        // Reset progress
        progressBarFill.style.width = '0%';
        progressText.textContent = '0%';
        fileNameDisplay.innerHTML = `جاري رفع: <strong>${file.name}</strong>`;

        const url = '/api/upload';
        const xhr = new XMLHttpRequest();
        const formData = new FormData();

        formData.append('file', file);
        formData.append('duration', expirationSelect.value);

        // Upload progress event
        xhr.upload.addEventListener("progress", function (e) {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                progressBarFill.style.width = percentComplete + '%';
                progressText.textContent = percentComplete + '%';
            }
        });

        // Request finished
        xhr.addEventListener("load", function () {
            progressContainer.classList.add('hidden');

            if (xhr.status === 200 || xhr.status === 429) {
                let response;
                try {
                    response = JSON.parse(xhr.responseText);
                } catch (e) {
                    showError("حدث خطأ غير متوقع.");
                    return;
                }

                if (xhr.status === 429) {
                    showError(response.error || "تجاوزت الحد المسموح. يرجى الانتظار.");
                } else if (response.success) {
                    showSuccess(response.link, expirationSelect.value);
                } else {
                    showError("فشل الرفع: " + (response.error || "خطأ غير معروف"));
                }
            } else {
                showError("حدث خطأ في الخادم (الكود: " + xhr.status + ")");
            }
        });

        // Request error
        xhr.addEventListener("error", function () {
            progressContainer.classList.add('hidden');
            showError("حدث خطأ في الاتصال بالخادم. تأكد من اتصالك بالإنترنت.");
        });

        // Request aborted
        xhr.addEventListener("abort", function () {
            progressContainer.classList.add('hidden');
            showError("تم إلغاء عملية الرفع.");
        });

        xhr.open("POST", url, true);
        xhr.send(formData);
    }

    function showSuccess(link, durationVal) {
        resultContainer.classList.remove('hidden');
        downloadLinkInput.value = link;

        if (durationVal === 'permanent') {
            resultExpirationText.textContent = 'رابط التحميل الخاص بك (دائم لا يحذف):';
        } else if (durationVal === '1') {
            resultExpirationText.textContent = 'رابط التحميل الخاص بك (صالح لمدة يوم واحد):';
        } else if (durationVal === '7') {
            resultExpirationText.textContent = 'رابط التحميل الخاص بك (صالح لمدة 7 أيام):';
        } else if (durationVal === '30') {
            resultExpirationText.textContent = 'رابط التحميل الخاص بك (صالح لمدة 30 يوماً):';
        }
    }

    function showError(msg) {
        errorContainer.classList.remove('hidden');
        errorMessage.textContent = msg;
    }

    // Copy to clipboard function
    copyBtn.addEventListener('click', () => {
        downloadLinkInput.select();
        downloadLinkInput.setSelectionRange(0, 99999); // For mobile devices

        navigator.clipboard.writeText(downloadLinkInput.value).then(() => {
            const originalIcon = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
            copyBtn.classList.add('btn-primary');
            copyBtn.classList.remove('btn-secondary');

            setTimeout(() => {
                copyBtn.innerHTML = originalIcon;
                copyBtn.classList.add('btn-secondary');
                copyBtn.classList.remove('btn-primary');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    });

    // Reset UI for another upload
    uploadAnotherBtn.addEventListener('click', resetUI);
    retryBtn.addEventListener('click', resetUI);

    function resetUI() {
        fileInput.value = ''; // Clear file input
        progressContainer.classList.add('hidden');
        resultContainer.classList.add('hidden');
        errorContainer.classList.add('hidden');
        dropZone.classList.remove('hidden');
    }
});
