document.addEventListener('DOMContentLoaded', function() {
    // 平滑滚动
    setupSmoothScrolling();
    
    // 导航栏效果
    setupNavbarEffects();
    
    // 示例过滤器
    setupExampleFilters();
    
    // 示例选择
    setupExampleSelection();
    
    // 3D 查看器初始化（如果需要）
    if (document.getElementById('3d-viewer')) {
        initializeViewer();
    }
});

// 平滑滚动功能
function setupSmoothScrolling() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const navbarHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - navbarHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// 导航栏效果
function setupNavbarEffects() {
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        } else {
            navbar.style.backgroundColor = 'white';
            navbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        }
    });
}

// 示例过滤器
function setupExampleFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const exampleItems = document.querySelectorAll('.example-item');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // 更新活动按钮状态
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            const filter = this.getAttribute('data-filter');
            
            // 过滤示例项
            exampleItems.forEach(item => {
                if (filter === 'all' || item.getAttribute('data-type') === filter) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });
}

// 示例选择
function setupExampleSelection() {
    const exampleItems = document.querySelectorAll('.example-item');
    
    exampleItems.forEach(item => {
        item.addEventListener('click', function() {
            // 移除其他项目的选中状态
            exampleItems.forEach(i => i.classList.remove('selected'));
            
            // 添加选中状态
            this.classList.add('selected');
            
            // 在现实应用中，这里应该加载对应的3D模型和问题/答案
            const exampleType = this.getAttribute('data-type');
            
            // 仅作示例 - 在实际应用中替换为真实数据
            document.getElementById('current-question').textContent = this.querySelector('p').textContent;
            document.getElementById('current-answer').textContent = `Object detected (Type: ${exampleType})`;
            
            // 如果有3D查看器，更新场景
            updateScene(exampleType);
        });
    });
}

// 全局变量
let scene, camera, renderer, controls;
let currentModel = null;

// 初始化3D查看器
function initializeViewer() {
    const container = document.getElementById('3d-viewer');
    
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    
    // 添加环境光和方向光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 10);
    scene.add(directionalLight);
    
    // 设置相机
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 5);
    
    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    
    // 添加控制
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // 添加阻尼效果
    controls.dampingFactor = 0.05;
    
    // 添加坐标系参考
    const axesHelper = new THREE.AxesHelper(1);
    scene.add(axesHelper);
    
    // 窗口调整大小事件
    window.addEventListener('resize', onWindowResize);
    
    // 加载默认模型
    loadDefaultModel();
    
    // 开始动画循环
    animate();
}
// 处理窗口大小变化
function onWindowResize() {
    const container = document.getElementById('3d-viewer');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// 动画循环
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// 加载默认模型
function loadDefaultModel() {
    // 创建一个简单的立方体作为默认模型
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x1a73e8 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
    currentModel = cube;
    
    // 或者加载一个简单的 glTF 模型
    // loadModelFromFile('models/default_scene.glb');
}

// 从文件加载模型
function loadModelFromFile(modelPath) {
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        modelPath,
        function(gltf) {
            // 移除当前模型
            if (currentModel) {
                scene.remove(currentModel);
            }
            
            // 添加新模型
            const model = gltf.scene;
            scene.add(model);
            
            // 缩放和居中模型
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3()).length();
            const center = box.getCenter(new THREE.Vector3());
            
            model.position.x -= center.x;
            model.position.y -= center.y;
            model.position.z -= center.z;
            
            const scaleFactor = 2 / size;
            model.scale.set(scaleFactor, scaleFactor, scaleFactor);
            
            currentModel = model;
            
            // 重置控制
            controls.reset();
        },
        function(xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function(error) {
            console.error('Error loading model:', error);
        }
    );
}
// 更新3D场景（示例）
// 根据示例类型更新场景
function updateScene(exampleType) {
    // 在实际应用中，这里会根据示例类型加载不同的模型
    console.log(`Updating scene for example type: ${exampleType}`);
    
    // 示例：根据类型改变模型颜色
    if (currentModel && currentModel.isMesh) {
        let color;
        
        switch(exampleType) {
            case 'relative-position':
                color = 0xff5722; // 橙色
                break;
            case 'containment':
                color = 0x4caf50; // 绿色
                break;
            case 'distance':
                color = 0x2196f3; // 蓝色
                break;
            default:
                color = 0x9c27b0; // 紫色
        }
        
        currentModel.material.color.set(color);
    }
    
    // 在实际应用中，这里会加载特定的模型
    // loadModelFromFile(`models/${exampleType}_example.glb`);
}


// 视频增强功能
function setupVideoEnhancements() {
    const video = document.getElementById('overview-video');
    if (!video) return;
    
    // 添加自动暂停当视频滚出视口
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting && !video.paused) {
                video.pause();
            }
        });
    }, { threshold: 0.2 });
    
    observer.observe(video);
    
    // 当视频加载元数据后调整容器大小(如果需要)
    video.addEventListener('loadedmetadata', function() {
        const aspectRatio = this.videoWidth / this.videoHeight;
        // 如果需要根据实际视频比例调整容器...
    });
}

// 在 DOMContentLoaded 事件中调用
document.addEventListener('DOMContentLoaded', function() {
    // ... 现有代码 ...
    
    // 设置视频增强功能
    setupVideoEnhancements();
});