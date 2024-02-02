import {Chart, registerables} from 'https://cdn.jsdelivr.net/npm/chart.js@4.3.2/+esm'

Chart.register(...registerables);

const getOrCreateLegendList = (chart, id) => {
	const legendContainer = document.getElementById(id);
	let listContainer = legendContainer.querySelector('ul');

	if (!listContainer) {
		listContainer = document.createElement('ul');
		listContainer.style.display = 'flex';
		listContainer.style.flexDirection = 'column';
		listContainer.style.margin = 0;
		listContainer.style.padding = 0;
		listContainer.style.height = `${chart.canvas.height}px`;
		listContainer.style.overflowY = 'auto';

		legendContainer.appendChild(listContainer);
	}

	return listContainer;
};

const htmlLegendPlugin = {
	id: 'htmlLegend',
	afterUpdate(chart, args, options) {
		const ul = getOrCreateLegendList(chart, options.containerID);

		// Remove old legend items
		while (ul.firstChild) {
			ul.firstChild.remove();
		}

		// Reuse the built-in legendItems generator
		const items = chart.options.plugins.legend.labels.generateLabels(chart);

		items.forEach(item => {
			const li = document.createElement('li');
			li.style.alignItems = 'center';
			li.style.cursor = 'pointer';
			li.style.display = 'flex';
			li.style.flexDirection = 'row';
			li.style.marginLeft = '10px';
			li.style.paddingBottom = '2px'

			li.onclick = () => {

				if(options.onClick) {
					options.onClick({label: item.text, value: null})
				} else {
					const {type} = chart.config;
					if (type === 'pie' || type === 'doughnut') {
						// Pie and doughnut charts only have a single dataset and visibility is per item
						chart.toggleDataVisibility(item.index);
					} else {
						chart.setDatasetVisibility(item.datasetIndex, !chart.isDatasetVisible(item.datasetIndex));
					}
					chart.update();
				}
			};

			// Color box
			const boxSpan = document.createElement('span');
			boxSpan.style.background = item.fillStyle;
			boxSpan.style.borderColor = item.strokeStyle;
			boxSpan.style.borderWidth = item.lineWidth + 'px';
			boxSpan.style.display = 'inline-block';
			boxSpan.style.flexShrink = 0;
			boxSpan.style.height = '20px';
			boxSpan.style.marginRight = '10px';
			boxSpan.style.width = '20px';

			// Text
			const textContainer = document.createElement('p');
			textContainer.style.color = "white";
			textContainer.style.margin = 0;
			textContainer.style.padding = 0;
			textContainer.style.fontSize = ".8rem"
			textContainer.style.textDecoration = item.hidden ? 'line-through' : '';

			const text = document.createTextNode(item.text);
			textContainer.appendChild(text);

			li.appendChild(boxSpan);
			li.appendChild(textContainer);
			ul.appendChild(li);

			ul.style.height = `${chart.canvas.style.height}`;
		});
	}
};

export class PieChart {
	constructor(id, dataGetter, label, onClick = null) {
		this.id = id
		this.dataGetter = dataGetter
		this.label = label
		this.onClick = onClick
		this.initialize()
	}

	async initialize() {
		this.data = await this.dataGetter()
		this.createHtmlElements()
		this.createGraph()
	}

	update = async () => {
		this.data = await this.dataGetter()
		this.chart.data.labels = this.data['labels']
		this.chart.data.datasets[0].data = this.data['data']
		this.chart.update()
	}

	createHtmlElements() {

		let parent = document.getElementById(this.id);
		parent.className = 'row gx-0';

		this.canvasContainer = document.createElement('div');
		this.canvasContainer.className = "col-md-8 col-12"

		this.canvas = document.createElement('canvas');
		this.canvas.id = `canvas-${this.id}`;

		this.legend = document.createElement('div');
		this.legend.id = `legend-${this.id}`;
		this.legend.className = "col-md-4 col-12"

		// Empty the children out of the parent element
		while (parent.firstChild) {
			parent.removeChild(parent.firstChild);
		}

		this.canvasContainer.appendChild(this.canvas);
		parent.appendChild(this.canvasContainer);
		parent.appendChild(this.legend);
	}

	async createGraph() {
		this.chart = new Chart(this.canvas, {
			type: 'pie',
			data: {
				labels: this.data['labels'],
				datasets: [{
					label: this.label,
					data: this.data['data'],
					borderWidth: 1
				}]
			},
			options: {
				responsive: true,
				plugins: {
					htmlLegend: {
						// ID of the container to put the legend in
						containerID: `legend-${this.id}`,
						onClick: this.onClick
					},
					legend: {
						display: false
					}
				}
			},
			plugins: [htmlLegendPlugin],
		});

		// Add a click event to the chart
		if(this.onClick) {
			this.canvas.onclick = this.onGraphClick.bind(this)
		}
	}

	async onGraphClick(e) {
		const points = this.chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
		if (points.length) {
			const firstPoint = points[0];
			const label = this.chart.data.labels[firstPoint.index];
			const value = this.chart.data.datasets[firstPoint.datasetIndex].data[firstPoint.index];

			console.log({label: label, value: value})

			this.onClick({label: label, value: value})
		}
	}
}