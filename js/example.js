// 全局变量
let scene, camera, renderer, controls;
let currentMesh = null;
let selectedObject = null;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let annotations = [];
let currentFileName = '';
let instanceData = null; // 存储实例ID数据
let selectedInstanceIds = []; // 存储多个选中的实例ID
let instanceMask = null; // 添加实例掩码变量

// 初始化
document.addEventListener('DOMContentLoaded', init);

function init() {
    // 初始化3D场景
    initScene();
    
    // 获取PLY文件列表
    fetchPlyFiles();
    
    // 添加事件监听器
    document.getElementById('add-annotation').addEventListener('click', addAnnotation);
    
    // 修改提示信息，从Shift+点击改为双击
    const viewer = document.getElementById('viewer');
    const tipDiv = document.createElement('div');
    tipDiv.id = 'selection-tip';
    tipDiv.textContent = '提示：双击可选择对象';
    tipDiv.style.position = 'absolute';
    tipDiv.style.top = '10px';
    tipDiv.style.left = '10px';
    tipDiv.style.color = '#fff';
    tipDiv.style.background = 'rgba(0,0,0,0.5)';
    tipDiv.style.padding = '5px 10px';
    tipDiv.style.borderRadius = '3px';
    tipDiv.style.zIndex = '1000';
    viewer.appendChild(tipDiv);
    
    // 窗口大小调整时重新渲染
    window.addEventListener('resize', onWindowResize);
}

function initScene() {
    // 创建场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x444444); // 使用中等灰色背景
    
    // 创建相机
    const container = document.getElementById('viewer');
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    camera.position.z = 5;
    
    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // 提高渲染质量
    renderer.shadowMap.enabled = true; // 启用阴影
    container.appendChild(renderer.domElement);
    
    // 添加轨道控制
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    
    // 增强光照系统
    // 环境光 - 提高亮度
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    
    // 主方向光 - 增强亮度并启用阴影
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);
    
    // 添加额外的光源以增强照明
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-1, 0.5, -1);
    scene.add(directionalLight2);
    
    // 添加点光源以增强细节
    const pointLight = new THREE.PointLight(0xffffff, 0.8, 50);
    pointLight.position.set(0, 5, 0);
    scene.add(pointLight);
    
    // 添加坐标轴辅助
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);
    
    // Add double click event
    renderer.domElement.addEventListener('dblclick', onMouseClick);
    // 开始动画循环
    animate();
}
    
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    const container = document.getElementById('viewer');
    const aspect = container.clientWidth / container.clientHeight;
    
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    
    renderer.setSize(container.clientWidth, container.clientHeight);
}

async function loadPlyFile(filename) {
    try {
        // 高亮选中的文件
        const fileItems = document.querySelectorAll('#ply-files li');
        fileItems.forEach(item => item.classList.remove('active'));
        
        const selectedItem = Array.from(fileItems).find(item => item.textContent === filename);
        if (selectedItem) {
            selectedItem.classList.add('active');
        }
        
        // 清除当前场景中的模型
        if (currentMesh) {
            scene.remove(currentMesh);
            currentMesh = null;
        }
        
        // 重置选中状态
        selectedObject = null;
        
        // 保存当前文件名
        currentFileName = filename;
        
        // 加载PLY文件
        const loader = new THREE.PLYLoader();
        
        // 显示加载中的提示
        const viewer = document.getElementById('viewer');
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loading';
        loadingDiv.textContent = '加载中...';
        loadingDiv.style.position = 'absolute';
        loadingDiv.style.top = '50%';
        loadingDiv.style.left = '50%';
        loadingDiv.style.transform = 'translate(-50%, -50%)';
        loadingDiv.style.color = '#FFFFFF';
        loadingDiv.style.fontSize = '20px';
        viewer.appendChild(loadingDiv);
        
        // 尝试加载对应的npy文件作为实例掩码
        try {
            // 获取npy文件名（与PLY文件同名但扩展名为.npy）
            const npyFilename = filename.replace('.ply', '.npy');
            const response = await fetch(`models/${npyFilename}`);
            
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                // 解析npy文件（需要服务器端支持）
                instanceMask = await parseNpyFile(arrayBuffer);
                console.log(`已加载实例掩码，包含 ${new Set(instanceMask).size} 个实例`);
            } else {
                console.warn(`未找到对应的npy文件: ${npyFilename}`);
                instanceMask = null;
            }
        } catch (error) {
            console.error('加载实例掩码失败:', error);
            instanceMask = null;
        }
        
        // 加载模型
        loader.load(
           `models/${filename}`,
            (geometry) => {
                // 确保正确计算法线
                geometry.computeVertexNormals();
                
                // 修复法线方向
                const posAttr = geometry.getAttribute('position');
                const normAttr = geometry.getAttribute('normal');
                for (let i = 0; i < posAttr.count; i++) {
                    const normal = new THREE.Vector3(
                        normAttr.getX(i),
                        normAttr.getY(i),
                        normAttr.getZ(i)
                    );
                    // 确保法线长度正确
                    if (normal.length() === 0) {
                        normal.set(0, 0, 1);
                    } else {
                        normal.normalize();
                    }
                    normAttr.setXYZ(i, normal.x, normal.y, normal.z);
                }
                normAttr.needsUpdate = true;
                
                // 创建更适合点云/网格的材质
                const material = new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    vertexColors: true,
                    flatShading: false,
                    side: THREE.DoubleSide, // 双面渲染，解决黑色补丁问题
                    roughness: 0.5,
                    metalness: 0.1,
                });
                
                // 创建网格
                const mesh = new THREE.Mesh(geometry, material);
                
                // 计算包围盒并居中模型
                geometry.computeBoundingBox();
                const boundingBox = geometry.boundingBox;
                const center = boundingBox.getCenter(new THREE.Vector3());
                
                mesh.position.x = -center.x;
                mesh.position.y = -center.y;
                mesh.position.z = -center.z;
                
                // 计算法线以改善光照效果
                // 这行可以删除，因为我们已经在上面计算过法线了
                
                // 启用阴影
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                
                // 调整相机位置以适应模型大小
                const size = boundingBox.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const fov = camera.fov * (Math.PI / 180);
                let cameraZ = Math.abs(maxDim / Math.sin(fov / 2));
                
                // 设置相机位置
                camera.position.z = cameraZ * 1.5;
                
                // 更新控制器
                const minDistance = maxDim / 10;
                const maxDistance = cameraZ * 4;
                controls.minDistance = minDistance;
                controls.maxDistance = maxDistance;
                controls.target.set(0, 0, 0);
                controls.update();
                
                // 添加到场景
                scene.add(mesh);
                currentMesh = mesh;
                
                // 移除加载提示
                const loadingElement = document.getElementById('loading');
                if (loadingElement) {
                    loadingElement.remove();
                }
                
                // 加载标注
                loadAnnotations(filename.replace('.ply', '.json'));
                
                
                // 生成实例数据
                simulateInstanceData(geometry);
                
                // 将simulateInstanceData移到外部，不要嵌套在loadPlyFile内部
                function simulateInstanceData(geometry) {
                    // 在实际应用中，这应该从服务器获取实例ID数据
                    // 这里我们简单地为每个顶点分配一个随机ID
                    const positions = geometry.getAttribute('position');
                    const vertexCount = positions.count;
                    
                    // 创建实例ID数组
                    instanceData = new Uint16Array(vertexCount);
                    
                    // 修改实例分配方法，使用更自然的分割方式
                    // 基于空间位置而不是顶点索引来分配实例ID
                    const boundingBox = geometry.boundingBox || new THREE.Box3().setFromBufferAttribute(positions);
                    const size = boundingBox.getSize(new THREE.Vector3());
                    
                    // 使用网格划分而不是简单的顶点索引划分
                    const gridSize = 3; // 每个维度的网格数量
                    const cellSizeX = size.x / gridSize;
                    const cellSizeY = size.y / gridSize;
                    const cellSizeZ = size.z / gridSize;
                    
                    // 为每个顶点分配实例ID
                    for (let i = 0; i < vertexCount; i++) {
                        const x = positions.getX(i);
                        const y = positions.getY(i);
                        const z = positions.getZ(i);
                        
                        // 计算顶点所在的网格单元
                        const gridX = Math.floor((x - (boundingBox.min.x)) / cellSizeX);
                        const gridY = Math.floor((y - (boundingBox.min.y)) / cellSizeY);
                        const gridZ = Math.floor((z - (boundingBox.min.z)) / cellSizeZ);
                        
                        // 将三维网格索引转换为一维实例ID
                        // 确保值在有效范围内
                        const xIndex = Math.min(Math.max(gridX, 0), gridSize - 1);
                        const yIndex = Math.min(Math.max(gridY, 0), gridSize - 1);
                        const zIndex = Math.min(Math.max(gridZ, 0), gridSize - 1);
                        
                        // 计算实例ID (从1开始)
                        const instanceId = 1 + xIndex + yIndex * gridSize + zIndex * gridSize * gridSize;
                        instanceData[i] = instanceId;
                    }
                    
                    console.log(`已生成基于空间位置的实例ID`);
                }
            },
            (xhr) => {
                const percent = (xhr.loaded / xhr.total) * 100;
                const loadingElement = document.getElementById('loading');
                if (loadingElement) {
                    loadingElement.textContent = `加载中... ${Math.round(percent)}%`;
                }
            },
            (error) => {
                console.error('加载PLY文件失败:', error);
                alert('加载PLY文件失败: ' + error.message);
                
                // 移除加载提示
                const loadingElement = document.getElementById('loading');
                if (loadingElement) {
                    loadingElement.remove();
                }
            }
        );
    } catch (error) {
        console.error('加载文件失败:', error);
        alert('加载文件失败: ' + error.message);
    }
}

// 解析npy文件的函数
async function parseNpyFile(arrayBuffer) {
    // 这里是一个简化的npy解析器
    // 实际应用中，你可能需要使用专门的库或在服务器端处理
    try {
        // 检查npy文件头
        const headerLength = new DataView(arrayBuffer, 8, 2).getUint16(0, true);
        const headerStr = new TextDecoder().decode(new Uint8Array(arrayBuffer, 10, headerLength));
        
        // 解析头部信息
        const match = headerStr.match(/'descr':\s*'([<>]?)([a-zA-Z])(\d+)'/);
        if (!match) {
            throw new Error('无法解析npy文件头');
        }
        
        const endianness = match[1] === '>' ? false : true;
        const dataType = match[2];
        const bytesPerElement = parseInt(match[3]);
        
        // 计算数据开始位置
        const dataOffset = 10 + headerLength;
        
        // 根据数据类型创建适当的TypedArray
        let result;
        if (dataType === 'f') {
            if (bytesPerElement === 4) {
                result = new Float32Array(arrayBuffer, dataOffset);
            } else if (bytesPerElement === 8) {
                result = new Float64Array(arrayBuffer, dataOffset);
            }
        } else if (dataType === 'i') {
            if (bytesPerElement === 1) {
                result = new Int8Array(arrayBuffer, dataOffset);
            } else if (bytesPerElement === 2) {
                result = new Int16Array(arrayBuffer, dataOffset);
            } else if (bytesPerElement === 4) {
                result = new Int32Array(arrayBuffer, dataOffset);
            }
        } else if (dataType === 'u') {
            if (bytesPerElement === 1) {
                result = new Uint8Array(arrayBuffer, dataOffset);
            } else if (bytesPerElement === 2) {
                result = new Uint16Array(arrayBuffer, dataOffset);
            } else if (bytesPerElement === 4) {
                result = new Uint32Array(arrayBuffer, dataOffset);
            }
        }
        
        if (!result) {
            throw new Error(`不支持的数据类型: ${dataType}${bytesPerElement}`);
        }
        
        return Array.from(result);
    } catch (error) {
        console.error('解析npy文件失败:', error);
        return null;
    }
}
function onMouseClick(event) {
    // 计算鼠标在画布中的位置
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // 设置射线
    raycaster.setFromCamera(mouse, camera);
    
    // 检测与当前网格的交点
    if (currentMesh) {
        const intersects = raycaster.intersectObject(currentMesh);
        
        // 如果有交点，处理选择
        if (intersects.length > 0) {
            const intersect = intersects[0];
            const faceIndex = intersect.faceIndex;
            
            const geometry = currentMesh.geometry;
            const indices = geometry.getIndex();
            if (!indices) {
                console.error('几何体没有索引');
                return;
            }
            
            const face = [
                indices.getX(faceIndex * 3),
                indices.getX(faceIndex * 3 + 1),
                indices.getX(faceIndex * 3 + 2)
            ];
            
            // 使用实例掩码
            if (instanceMask && instanceMask.length > 0) {
                const vertexIndex = face[0];
                
                if (vertexIndex < instanceMask.length) {
                    const instanceId = instanceMask[vertexIndex];
                    
                    // 检查实例是否已经被选中
                    const index = selectedInstanceIds.indexOf(instanceId);
                    if (index !== -1) {
                        // 如果已选中，则移除
                        selectedInstanceIds.splice(index, 1);
                    } else {
                        // 如果未选中，则添加
                        selectedInstanceIds.push(instanceId);
                    }
                    
                    // 更新高亮显示
                    if (selectedInstanceIds.length > 0) {
                        highlightInstancesFromMask(selectedInstanceIds);
                    } else {
                        // 如果没有选中的实例，清除高亮
                        if (selectedObject) {
                            scene.remove(selectedObject);
                            selectedObject = null;
                        }
                    }
                    
                    // 更新选中信息显示
                    updateSelectionInfo(selectedInstanceIds);
                    return;
                }
            }
        }
    }
}

// 添加新的辅助函数来更新选中信息显示
function updateSelectionInfo(instanceIds) {
    // 移除之前的信息
    const oldInfo = document.getElementById('selection-info');
    if (oldInfo) oldInfo.remove();
    
    // 如果有选中的实例，显示新信息
    if (instanceIds.length > 0) {
        const infoDiv = document.createElement('div');
        infoDiv.id = 'selection-info';
        infoDiv.textContent = `选中的实例ID: ${instanceIds.join(', ')}`;
        infoDiv.style.position = 'absolute';
        infoDiv.style.bottom = '10px';
        infoDiv.style.left = '10px';
        infoDiv.style.color = '#fff';
        infoDiv.style.background = 'rgba(0,0,0,0.5)';
        infoDiv.style.padding = '5px 10px';
        infoDiv.style.borderRadius = '3px';
        
        document.getElementById('viewer').appendChild(infoDiv);
    }
}

// 添加基于实例掩码的高亮函数
function highlightInstancesFromMask(instanceIds) {
    if (!currentMesh || !instanceMask || instanceIds.length === 0) {
        // 如果没有选中的实例，确保移除旧的高亮
        if (selectedObject) {
            scene.remove(selectedObject);
            selectedObject = null;
        }
        return;
    }

    // 移除之前的高亮对象
    if (selectedObject) {
        scene.remove(selectedObject);
        selectedObject = null;
    }

    // 创建一个新的几何体来表示选中的实例
    const originalGeometry = currentMesh.geometry;
    const positions = originalGeometry.getAttribute('position');
    const originalColors = originalGeometry.getAttribute('color'); // 获取原始颜色
    const indices = originalGeometry.getIndex();

    // --- 修改开始 ---
    // 创建高亮材质，启用顶点颜色
    const highlightMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true, // 启用顶点颜色
        transparent: true,
        opacity: 0.9,       // 可以调整透明度
        side: THREE.DoubleSide,
        roughness: 0.5,
        metalness: 0.1,
        // color: 0xffffff, // 可以设置一个基础颜色，但顶点色会覆盖
    });
    // --- 修改结束 ---

    // 创建一个新的几何体
    const highlightGeometry = new THREE.BufferGeometry();

    // 收集属于选中实例的顶点、颜色和面
    const highlightVertices = [];
    const highlightColors = []; // 存储每个顶点的颜色
    const highlightFaces = [];
    const vertexMap = new Map(); // 映射原始顶点索引到高亮几何体中的新索引
    let newIndexCounter = 0;

    // 遍历所有面
    for (let i = 0; i < indices.count / 3; i++) {
        const faceIndices = [
            indices.getX(i * 3),
            indices.getX(i * 3 + 1),
            indices.getX(i * 3 + 2)
        ];

        // 获取每个顶点的实例ID
        const instanceIdsForFace = faceIndices.map(idx => (idx < instanceMask.length) ? instanceMask[idx] : -1);

        // 检查面是否至少有一个顶点属于选中的实例
        const faceHasSelectedInstance = instanceIdsForFace.some(id => instanceIds.includes(id));

        if (faceHasSelectedInstance) {
            const faceNewIndices = [];
            for (let j = 0; j < 3; j++) {
                const originalIndex = faceIndices[j];
                const instanceId = instanceIdsForFace[j];
                const isSelected = instanceIds.includes(instanceId);

                // 如果顶点还没有添加到高亮几何体中
                if (!vertexMap.has(originalIndex)) {
                    // 添加顶点位置
                    highlightVertices.push(
                        positions.getX(originalIndex),
                        positions.getY(originalIndex),
                        positions.getZ(originalIndex)
                    );

                    // --- 修改开始: 添加顶点颜色 ---
                    let vertexColor;
                    if (isSelected) {
                        // 如果顶点属于选中的实例，使用该实例的颜色
                        vertexColor = getColorForInstanceId(instanceId);
                    } else if (originalColors) {
                        // 如果不属于选中实例，但面部分被选中，使用原始颜色
                        vertexColor = new THREE.Color(
                            originalColors.getX(originalIndex),
                            originalColors.getY(originalIndex),
                            originalColors.getZ(originalIndex)
                        );
                    } else {
                        // 如果没有原始颜色，使用灰色作为默认值
                        vertexColor = new THREE.Color(0x888888);
                    }
                    highlightColors.push(vertexColor.r, vertexColor.g, vertexColor.b);
                    // --- 修改结束 ---

                    // 记录新索引
                    vertexMap.set(originalIndex, newIndexCounter);
                    faceNewIndices.push(newIndexCounter);
                    newIndexCounter++;
                } else {
                    // 如果顶点已存在，直接使用它的新索引
                    faceNewIndices.push(vertexMap.get(originalIndex));
                }
            }
            // 添加面索引
            highlightFaces.push(faceNewIndices[0], faceNewIndices[1], faceNewIndices[2]);
        }
    }

    // 设置几何体属性
    highlightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(highlightVertices, 3));
    // --- 修改开始: 设置颜色属性 ---
    if (highlightColors.length > 0) {
        highlightGeometry.setAttribute('color', new THREE.Float32BufferAttribute(highlightColors, 3));
    }
    // --- 修改结束 ---
    highlightGeometry.setIndex(highlightFaces); // 设置面索引

    // 计算法线
    highlightGeometry.computeVertexNormals();

    // 创建高亮网格
    const highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);

    // 应用与原始网格相同的变换
    highlightMesh.position.copy(currentMesh.position);
    highlightMesh.rotation.copy(currentMesh.rotation);
    highlightMesh.scale.copy(currentMesh.scale);

    // 添加到场景
    scene.add(highlightMesh);
    selectedObject = highlightMesh;

    // 存储选中的实例ID (可选，如果其他地方需要)
    selectedObject.userData.instanceIds = instanceIds;
}

// 修改添加标注函数以支持多个实例
function addAnnotation() {
    if (!selectedObject || !selectedObject.userData.instanceIds || selectedObject.userData.instanceIds.length === 0) {
        alert('请先选择至少一个对象');
        return;
    }
    
    const description = document.getElementById('description').value.trim();
    if (!description) {
        alert('请输入描述');
        return;
    }

    // --- 修改开始: 扩展相机参数的保存 ---
    // 获取相机基本参数
    const position = camera.position.toArray();
    const target = controls.target.toArray(); // 目标点
    const up = camera.up.toArray();

    // 计算相机方向向量
    const directionVec = new THREE.Vector3();
    camera.getWorldDirection(directionVec);
    const direction = directionVec.toArray();

    // 获取相机外参矩阵 (World Matrix)
    const extrinsicMatrix = camera.matrixWorld.clone();
    const extrinsicFlat = extrinsicMatrix.elements; // 16个元素的一维数组
    // 将一维数组转换为 4x4 二维数组
    const extrinsic = [];
    for (let i = 0; i < 4; i++) {
        extrinsic.push(extrinsicFlat.slice(i * 4, i * 4 + 4));
    }

    // 获取/计算相机内参
    const width = renderer.domElement.clientWidth;
    const height = renderer.domElement.clientHeight;
    const fovRad = THREE.MathUtils.degToRad(camera.fov); // fov 是垂直视场角
    // 假设像素是方形的，焦距 fx 和 fy 可以这样计算
    // 注意：这是一种简化计算，精确值可能需要从相机标定中获取
    const fy = height / (2 * Math.tan(fovRad / 2));
    const fx = fy; // 假设 fx = fy
    const cx = width / 2;
    const cy = height / 2;
    const intrinsic = {
        width: width,
        height: height,
        fx: fx,
        fy: fy,
        cx: cx,
        cy: cy
    };

    // 组合所有相机参数
    const cameraParams = {
        extrinsic: extrinsic,
        intrinsic: intrinsic,
        position: position,     // 保留以便 viewAnnotation 使用
        target: target,         // 保留以便 viewAnnotation 使用
        direction: direction,
        up: up,                 // 保留以便 viewAnnotation 使用
        view_description: description // 使用用户输入的描述
    };
    // --- 修改结束 ---

    // 创建标注对象
    const objectIds = selectedObject.userData.instanceIds;
    let fullText = description;

    // 为每个实例ID添加标记
    objectIds.forEach(id => {
        fullText += ` [${id}]`;
    });

    const annotation = {
        description: description,
        object_ids: objectIds,
        full_text: fullText,
        camera_params: cameraParams // 使用新的 cameraParams 结构
    };
    
    // 添加到标注列表
    annotations.push(annotation);

    // 清空描述输入框
    document.getElementById('description').value = '';

    // 更新标注列表显示
    const annotationsList = document.getElementById('annotations-list');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${objectIds.join(', ')}</td>
        <td>${description}</td>
        <td>
            <button class="view-btn" onclick="viewAnnotation(${annotations.length - 1})">查看</button>
            <button class="delete-btn" onclick="deleteAnnotation(${annotations.length - 1})">删除</button>
        </td>
    `;
    annotationsList.appendChild(tr);

    // 显示成功提示
    const viewer = document.getElementById('viewer');
    const successDiv = document.createElement('div');
    successDiv.textContent = '标注已添加，正在保存...';
    successDiv.style.position = 'absolute';
    successDiv.style.top = '50%';
    successDiv.style.left = '50%';
    successDiv.style.transform = 'translate(-50%, -50%)';
    successDiv.style.background = 'rgba(0, 255, 0, 0.8)';
    successDiv.style.color = 'white';
    successDiv.style.padding = '10px 20px';
    successDiv.style.borderRadius = '5px';
    successDiv.style.zIndex = '1000';
    viewer.appendChild(successDiv);

    // 自动保存标注
    saveAnnotations().then(() => {
        // 更新成功提示
        successDiv.textContent = '标注已添加并保存';
        // 2秒后移除提示
        setTimeout(() => {
            successDiv.remove();
        }, 2000);
    }).catch(() => {
        // 如果保存失败，更新提示
        successDiv.textContent = '标注已添加，但保存失败';
        successDiv.style.background = 'rgba(255, 0, 0, 0.8)';
        // 3秒后移除提示
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    });
}

// 修改保存标注函数
async function saveAnnotations() {
    try {
        const response = await fetch(`/api/save-annotation/${currentFileName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(annotations)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            alert(`保存成功: ${result.message}`);
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('保存标注失败:', error);
        alert('保存标注失败: ' + error.message);
    }
}

// 修改加载标注函数
async function loadAnnotations(filename) {
    try {
        let f1 = filename.replace("mesh_aligned_0.05","regular_annotations")
        const response = await fetch(`models/${f1}`);
        const data1 = await response.json();

        let f2 = filename.replace("mesh_aligned_0.05","spatial_annotations")
        const response2 = await fetch(`models/${f2}`);
        const data2 = await response2.json();
        // Merge commonsense annotations from both data sources
        const commonsense1 = data1.commonsense || [];
        const commonsense2 = data1.human_intention || [];        
        const commonsense3 = data2.abs_annotations || [];
        const commonsense4 = data2.rel_annotations || [];
        let data = commonsense1.concat(commonsense2).concat(commonsense3).concat(commonsense4);

        
        annotations = data || [];
        console.log(annotations);

         // 获取所有唯一的 question_type
         const questionTypes = [...new Set(annotations.map(annotation => annotation.question_type).filter(type => type))];
         // 生成过滤按钮
         generateFilterButtons(questionTypes);

        showAnnotations("all");
    } catch (error) {
        console.error('加载标注失败:', error);
        annotations = [];
    }
}
// 添加生成过滤按钮的函数
function generateFilterButtons(questionTypes) {
    const filterContainer = document.querySelector('.filter-buttons');
    filterContainer.innerHTML = ''; // 清空之前的按钮

    questionTypes.forEach(type => {
        const button = document.createElement('button');
        button.textContent = type;
        button.style.margin = '2px';
        button.onclick = () => showAnnotations(type);
        filterContainer.appendChild(button);
    });
}
async function showAnnotations(filter) {
    try {
        // 更新标注列表显示
        const annotationsList = document.getElementById('annotations-list');
        annotationsList.innerHTML = '';
        
        // 根据filter参数过滤annotations
        let filteredAnnotations = annotations;
        if (filter && filter !== 'all') {
            filteredAnnotations = annotations.filter(annotation => 
                annotation.question_type === filter
            );
        }
        
        // 只显示前3条记录
        filteredAnnotations.slice(0, 3).forEach((annotation, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${annotation.description}</td>
                <td>
                    <button class="view-btn" onclick="viewAnnotation(${annotations.indexOf(annotation)})">show</button>
                </td>
            `;
            annotationsList.appendChild(tr);
        });
        
        console.log(`已加载 ${filteredAnnotations.length} 条标注（过滤条件: ${filter || 'all'}）`);
    } catch (error) {
        console.error('加载标注失败:', error);
        annotations = [];
    }
}

// 添加删除标注函数
async function deleteAnnotation(index) {
    if (!confirm('确定要删除这条标注吗？')) {
        return;
    }

    // 从数组中删除标注
    annotations.splice(index, 1);

    // 更新显示
    const annotationsList = document.getElementById('annotations-list');
    annotationsList.innerHTML = '';
    
    annotations.forEach((annotation, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${annotation.object_ids.join(', ')}</td>
            <td>${annotation.description}</td>
            <td>
                <button class="view-btn" onclick="viewAnnotation(${idx})">查看</button>
                <button class="delete-btn" onclick="deleteAnnotation(${idx})">删除</button>
            </td>
        `;
        annotationsList.appendChild(tr);
    });

    // 自动保存更改
    try {
        await saveAnnotations();
        // 显示成功提示
        const viewer = document.getElementById('viewer');
        const successDiv = document.createElement('div');
        successDiv.textContent = '标注已删除并保存';
        successDiv.style.position = 'absolute';
        successDiv.style.top = '50%';
        successDiv.style.left = '50%';
        successDiv.style.transform = 'translate(-50%, -50%)';
        successDiv.style.background = 'rgba(0, 255, 0, 0.8)';
        successDiv.style.color = 'white';
        successDiv.style.padding = '10px 20px';
        successDiv.style.borderRadius = '5px';
        successDiv.style.zIndex = '1000';
        viewer.appendChild(successDiv);

        setTimeout(() => {
            successDiv.remove();
        }, 2000);
    } catch (error) {
        console.error('保存失败:', error);
        alert('删除标注成功，但保存失败');
    }
}

// --- 添加开始: 查看标注函数 ---
function viewAnnotation(index) {
    if (index < 0 || index >= annotations.length) {
        console.error('无效的标注索引:', index);
        return;
    }

    const annotation = annotations[index];
    const objectIds = annotation.object_id;
    const objectNames = annotation.object_name;

    if (!objectIds || objectIds.length === 0) {
        console.warn('此标注没有关联的对象ID');
        // 清除当前高亮（如果需要）
        if (selectedObject) {
            scene.remove(selectedObject);
            selectedObject = null;
        }
        updateSelectionInfo([]); // 清空选中信息
        return;
    }

    // 更新当前选中的实例ID列表
    selectedInstanceIds = [...objectIds]; // 创建副本以避免直接修改原数组

    // 高亮对应的实例
    highlightInstancesFromMask(selectedInstanceIds);

    // 更新选中信息显示
    updateSelectionInfo(selectedInstanceIds);

    // --- 修改开始: 恢复相机视角 ---

// --- 添加结束 ---


// --- 添加结束 ---
    // 恢复相机视角
    const description = annotation.description;
    const match = description.match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
    
    if (0 && match) {
        const cameraParams = match.slice(1, 5).map(Number);
        console.log('解析出的相机参数:', cameraParams);
        // 使用解析出的相机参数进行相机设置
        camera.position.set(cameraParams[0], cameraParams[1], cameraParams[2]);
        controls.target.set(cameraParams[3], cameraParams[4], cameraParams[5]);
        controls.update();
    } else {
        console.warn('描述中没有找到有效的相机参数');
    }
    if (annotation.camera_params && annotation.camera_params.position && annotation.camera_params.target && annotation.camera_params.up) {
        const params = annotation.camera_params;
        camera.position.fromArray(params.position);
        controls.target.fromArray(params.target); // 设置控制器的目标点
        camera.up.fromArray(params.up);           // 设置相机的上方向
        controls.update(); // 更新控制器状态以应用更改
        console.log('相机视角已恢复');
    } else {
        console.warn('此标注没有保存完整的相机参数 (position, target, up)');
    }
    // --- 添加开始: 更新问题和答案显示 ---
    document.getElementById('current-question').textContent = annotation.description;
    let dis = `Objects: ${objectNames.map((name, i) => `${name}(${objectIds[i]})`).join(', ')}`
    console.log("---===>>",dis);
    document.getElementById('current-answer').textContent = dis;
    // --- 修改结束 ---
}


// --- 添加开始 ---
// 根据实例ID生成稳定且不同的颜色
function getColorForInstanceId(instanceId) {
    // 使用 HSL 颜色空间生成颜色，以获得更好的区分度
    // 基于 golden angle 来分散色调
    const hue = (instanceId * 137.508) % 360; // 黄金角度近似值
    // 饱和度和亮度可以稍微变化，或保持固定以获得更一致的外观
    const saturation = 0.75; // 保持较高的饱和度
    const lightness = 0.6;  // 保持适中的亮度
    return new THREE.Color().setHSL(hue / 360, saturation, lightness);
}
// --- 添加结束 --