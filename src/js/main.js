import { route, startRouter } from './router.js';
import { session } from './services/session.js';
import { mountLayout } from './components/layout.js';
import { homePage } from './pages/home.js';
import { projectsPage, projectDetailPage, publishPage } from './pages/projects.js';
import { communityPage, memberPage, talentsPage } from './pages/community.js';
import { loginPage, registerPage } from './pages/auth.js';
import { aboutPage, privacyPage, termsPage } from './pages/static.js';

route('/', homePage);
route('/projetos', projectsPage);
route('/projetos/publicar', publishPage); // antes de /projetos/:slug
route('/projetos/:slug', projectDetailPage);
route('/comunidade', communityPage);
route('/comunidade/:slug', memberPage);
route('/talentos', talentsPage);
route('/entrar', loginPage);
route('/cadastro', registerPage);
route('/sobre', aboutPage);
route('/privacidade', privacyPage);
route('/termos', termsPage);

mountLayout(document.getElementById('header'), document.getElementById('footer'));
await session.restore();
startRouter(document.getElementById('app'));
