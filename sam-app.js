
// Defined globally accessible variables 
let focusedCategory = null;
let originalData = null;
let isFocusing = false;
let focusCatName = null;
let categoryValuesMap = new Map();
let stateValuesMap = new Map();

// Read processed json data, populate category pane and build sunburst
d3.json('hierarchical_data.json')
    .then(data => {
        originalData = data;
        let categories = [originalData];
        
        // Populate the Category pane.
        categories = categories.concat(data.children.map(category => category));
        populateCategoryPane(categories);

        // build sunburst
        buildSunburst(data)
    })
    .catch(function(error) {
        console.error('Error loading the data:', error);
    });


/**
 * populateCategoryPane - Dynamically Polulate the catgeory (or legend) pane with category data
 * @param categories a list of nested category
 */
 function populateCategoryPane(categories){

    const categoryPane = document.getElementById('category-pane');
    categories.forEach(category => {
        // Create a category item element
        const categoryItem = document.createElement('div');
        categoryItem.classList.add('category-item');
    
        // Create a color box element and assign category color
        const colorBox = document.createElement('div');
        colorBox.classList.add('color-box');
        colorBox.style.backgroundColor = getCategoryColor(category.name === "Root" ? "All" :category.name);
    
        // Create a span element for category name
        const categoryName = document.createElement('span');
        categoryName.classList.add('category-name');
        categoryName.textContent = category.name != "Root" ?  category.name :  "All";
    
        // Append color box and category name to category item
        categoryItem.appendChild(colorBox);
        categoryItem.appendChild(categoryName);

        categoryItem.addEventListener('click', function(event){
        
            isAllCat = category.name === "Root" ? true : false
            let g = categories[0]
            let pare = {children:[...g.children], data:{name:"Root", children:category.children}, depth:0, height:3,  parent:null}
            let formattedCategoryNode = {data:category, depth:1, height:2, parent:pare, children:category.children};

            handleCategoryClick(event, formattedCategoryNode, isAllCat)
        })
    
        // Append category item to category pane
        categoryPane.appendChild(categoryItem);
    });
    
}


/**
 * buildSunburst - Calculate sunburst logic and draw sunburst using D3.js lib
 * @param data 
 */
function buildSunburst(data) {

    // Define Dimensions and Margins
    const width = 600;
    const height = 600;
    const radius = Math.min(width, height) / 2;
    
    // Clear exiting SVG from DOM
    d3.select('#sunburst-container').select('svg').remove();

    // Set up the SVG container
    const svg = d3.select('#sunburst-container').append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${width / 2}, ${height / 2})`);
    
    // Set up D3 partition layout
    const partition = d3.partition()
        .size([2 * Math.PI, radius * radius]);
    
    // Create the root node from D3 hierarchy
    const root = d3.hierarchy(data)
        .sum(d => d.value)
        .sort((a, b) => b.value - a.value);

    partition(root);

    
    // Update the arc generator with the current angle range
    const arc = d3.arc()
                    .startAngle(d => Math.max(0, Math.min(2 * Math.PI, d.x0)))
                    .endAngle(d => Math.max(0, Math.min(2 * Math.PI, d.x1)))
                    .innerRadius(d => Math.sqrt(Math.max(0, d.y0)))
                    .outerRadius(d => Math.sqrt(Math.max(0, d.y1)));

    // Clear existing sunburst paths
    svg.selectAll('path').remove();

    // Draw each arc segment iteratively
    svg.selectAll('path')
        .data(root.descendants())
        .enter()
        .append('path')
        .attr('d', arc)
        .style('cursor', 'pointer')
        .style('fill', d => {
            // Assign segment color by category name
            if (d.depth === 0) {
                return '#fff'
            }
            
            const focusingMode = isFocusing == true && focusCatName != null
            const categoryName = focusingMode ? focusCatName : findRootCategory(d).data.name;
            return getCategoryColor(categoryName);
        })

        // Calculate and save details for each node for use during node focusing
        .each(function(d) {

            if (d.depth === 1) {
                const name = d.data.name;
                const value = d.value;
                const level = `${d.ancestors().map(d => d.data.name).reverse().join('->')}`
                categoryValuesMap.set(name, {"Category": name, "Total Shipped": value, "Breadcrumb": level});
            }

            const catName = findRootCategory(d).data.name
            if (d.depth === 2) {
                
                const name = `${catName}|${d.data.name}`;
                const value = d.value
                const level = `${d.ancestors().map(d => d.data.name).reverse().join('->')}`
                stateValuesMap.set(name, {"Category": catName, "Ship State": d.data.name, "Total Shipped": value, "Breadcrumb": level})
            }

            if (d.depth === 3) {
                const name = `${catName}|${d.data.name}`;
                stateValuesMap.set(name, {"Category": catName, "ship_state": d.parent.data.name})
            }
        
        })
        .style('stroke', '#fff')
        .on('click', (event, d) => {
            handleCategoryClick(event, d)
        })
        
        .append("title")
        .text(d => `${d.ancestors().map(d => d.data.name).reverse().join('->')}\nValue: ${d.value}`);

    // For mouseover, we will gently translate amd upscale the focused segment
    svg.selectAll('path')
        .on('mouseover', function() {
            d3.select(this)
                .transition()
                .duration(300)
                .attr('transform', 'scale(1.1)');
        })
        .on('mouseout', function() {
            d3.select(this)
                .transition()
                .duration(300)
                .attr('transform', 'scale(1)');
        });

    svg.transition()
        .duration(5000)
        .tween("draw", () => {
          const interpolator = d3.interpolate(0, 360);
          return t => {
            const angle = interpolator(t);
            svg.selectAll("path")
              .attr("opacity", d => {
                const startAngle = Math.max(0, d.x0);
                const endAngle = Math.min(2 * Math.PI, d.x1);
                return endAngle <= angle ? 1 : 0;
              });
          };
        });

}

/**
 * findRootCategory - Calculate the category of a node.
 * @param d the node whose category is to be calculated
 * @returns category object
 * 
 * As we drill down the hierarchy of any node, we need to be able tell, at any given level, what category we are looking at.
 * This function is a utility to easily calculate the category of any given point in the nestation.
*/
function findRootCategory(d) {
    let current = d;
    while (current.parent && current.parent.parent) { 
        current = current.parent;
    }
    return current;
}

/**
 * handleCategoryClick handles the click action of any node passed to it
 * @param event click event
 * @param clickedNode circular data.
 * @param itsAllCat a boolean to tell if All-item in category pane has been clicked or not.
 */
function handleCategoryClick(event, clickedNode, itsAllCat = false) {
    event.stopPropagation();
   
    focusCatName = findRootCategory(clickedNode).data.name

    // Covert focus node to Root node wjile maintaning the three nested levels in original data
    let formattedClickedNode = composeFocusNode(clickedNode);
   
    /** 
     * We will build sunburst with either original data or focused node data
     * The All category (or Legend) in category pane has an undefined depth becuase it is not part of the sunburst svg. when clicked,
     * the effect should be the same as when the center of the sunburst (Root) is clicked i.e build sunburst with original data (i.e sunburst before focus)
    */
    if ( itsAllCat || clickedNode.depth === 0) {
        
        isFocusing = false
        focusCatName = null
        // Build sunBurst with original Data
        buildSunburst(originalData);
    }else{

        isFocusing = true
        buildSunburst(formattedClickedNode);   
    }

    hideOrDisplayDetails(clickedNode)  
} 

/**
 * Function to get color for a specific category
 * @param string category name for which color is to be retrieved
 * @returns Hexadecimal color code as a string
 */
function getCategoryColor(category) {
    // Define a set of color pallets for categories
    const categoryColors = {
        "All" : "#AEB1B0",
        "Blouse": "#FF5733",
        "Bottom": "#FFC300",
        "Dupatta": "#C70039",
        "Ethnic Dress": "#900C3F",
        "Saree": "#581845",
        "Set": "#FF6347",
        "Top": "#FFA07A",
        "Western Dress": "#F08080",
        "kurta": "#0000FF"
    }

    return categoryColors[category] || "#000";
}


/**
 * hideOrDisplayDetails is use to control the display of the details-pane (in the DOM) i.e hide or show
 * It retrieves relevant information from the focused node and display same base on hide or show conditions 
 * @param node 
 */
function hideOrDisplayDetails(node){

    const categoryPane = document.getElementById('details-pane');
    const list = document.getElementById("detailsList");

    // Clear existing list items
    list.innerHTML = '';

    if (isFocusing) {
        const nodeDetils = getDetails(node)
        // Iterate over the focused segment details to create and append each list item
        Object.keys(nodeDetils).forEach(key => {
            const li = document.createElement("li");
            li.innerHTML = `<span class="label">${formatString(key)}:   </span> <span class="value">${nodeDetils[key]}</span>`;
            list.appendChild(li);
        });
        categoryPane.style.display = "block";

    } else {
        categoryPane.style.display = "none";
    }

}


/**
 * Generates a detail object of the segment/sector of a sunburst
 * @param node the segment/sector node
 * @returns 
 */
function getDetails(node) {

    if (node.depth === undefined || node.depth === 1) {
        let setName = node.data.name
        return  categoryValuesMap.get(setName)
    }

    
    if (node.depth === 2) {
        let setName = `${node.parent.data.name}|${node.data.name}`
        let stateDetails = stateValuesMap.get(setName)
        return stateDetails
    }
    
    let setName = `${node.parent.parent.data.name || ""}|${node.data.name}`
    let stateDetails = stateValuesMap.get(setName)
    let bedCrumbs = `${node.ancestors().map(d => d.data.name).reverse().join('->')}`

    return { 
             ["Category"]:stateDetails.Category, 
             ["State City"]: node.data.name,
             ["State Shipped"]: stateDetails.ship_state, 
            ...node.data.details,  
             ["Breadcrumb"]:bedCrumbs
        }
}

/**
 * Compose a three level nested data base on the clicked node
 * @param clickedNode Node clicked by user during interractivity
 * @return a three level circular data
 */ 
function composeFocusNode(clickedNode) {
    let formattedClickedNode = { name: "Root", children: [] };

    if (clickedNode.depth === 1) {
        formattedClickedNode.children.push(clickedNode.data);
    }

    if (clickedNode.depth === 2) {
        formattedClickedNode.children.push({
            name: clickedNode.parent.data.name,
            children: [clickedNode.data]
        });
    }

    if (clickedNode.depth === 3) {
        formattedClickedNode.children.push({
            name: clickedNode.parent.parent.data.name,
            children: [{
                name: clickedNode.parent.data.name,
                children: [clickedNode.data]
            }]
        });
    }

    return formattedClickedNode;
}

/**
 * Format string to a presentable format - remove underscores and capitalize first letter
 * @param str the string to format 
 * @return the correctly formmated string
*/
function formatString(str) {
    let words = str.split('_');
    let formattedWords = words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    return formattedWords.join(' ');
}
